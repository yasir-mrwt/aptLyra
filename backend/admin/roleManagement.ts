import { randomUUID } from "node:crypto";
import { query, withDatabaseLock } from "../config/db.js";

export const APP_ROLES = ["owner", "admin", "reviewer", "user"] as const;
export type AppRole = typeof APP_ROLES[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = (code: string): never => { throw new Error(code); };

async function roleOf(userId: string): Promise<AppRole> {
  const row=(await query("SELECT app_role FROM users WHERE id=$1",[userId])).rows[0];
  if(!row) return invalid("user-not-found");
  return row.app_role as AppRole;
}
async function requireManager(userId: string): Promise<AppRole> {
  const role=await roleOf(userId);
  if(role!=="owner"&&role!=="admin")invalid("role-forbidden");
  return role;
}
async function userReviewerIdentity(userId: string,enabled: boolean) {
  const target=(await query("SELECT id,name FROM users WHERE id=$1",[userId])).rows[0];
  if(!target)invalid("user-not-found");
  const linked=(await query("SELECT id FROM ingestion_reviewers WHERE user_id=$1 FOR UPDATE",[userId])).rows[0];
  if(linked){await query("UPDATE ingestion_reviewers SET kind='human',display_name=$2,enabled=$3 WHERE id=$1",[linked.id,target.name,enabled]);return;}
  const id=`user-${userId}`;
  await query("INSERT INTO ingestion_reviewers(id,display_name,kind,enabled,user_id) VALUES($1,$2,'human',$3,$4)",[id,target.name,enabled,userId]);
}
async function audit(actor:string|null,target:any,action:string,previous:AppRole|null,next:AppRole,reason:string,metadata:Record<string,unknown>={}) {
  await query(`INSERT INTO user_role_audit(id,actor_user_id,target_user_id,target_email,action,previous_role,new_role,reason,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),actor,target.id,target.email,action,previous,next,reason,JSON.stringify(metadata)]);
}

export const roleManagement={
  async current(userId:string){
    const row=(await query(`SELECT u.id,u.name,u.email,u.app_role,r.id AS reviewer_id,r.enabled AS reviewer_enabled
      FROM users u LEFT JOIN ingestion_reviewers r ON r.user_id=u.id WHERE u.id=$1`,[userId])).rows[0];
    if(!row)return invalid("user-not-found");
    return {id:row.id,name:row.name,email:row.email,role:row.app_role,reviewerLinked:Boolean(row.reviewer_id&&row.reviewer_enabled)};
  },
  async team(actorId:string){
    await requireManager(actorId);
    return (await query(`SELECT id,name,email,app_role AS role,created_at FROM users ORDER BY
      CASE app_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END,created_at,id LIMIT 500`)).rows;
  },
  async assignRole(actorId:string,targetId:string,requestedRole:unknown){
    if(!uuid.test(targetId)||typeof requestedRole!=="string"||!APP_ROLES.includes(requestedRole as AppRole)||requestedRole==="owner")invalid("invalid-role-request");
    const next=requestedRole as AppRole;
    return withDatabaseLock("admin:roles:v1",async()=>{
      const actorRole=await requireManager(actorId);
      if(actorRole==="admin"&&next!=="reviewer"&&next!=="user")invalid("role-forbidden");
      const target=(await query("SELECT id,name,email,app_role FROM users WHERE id=$1 FOR UPDATE",[targetId])).rows[0];
      if(!target)invalid("user-not-found");
      const previous=target.app_role as AppRole;
      if(previous==="owner")invalid("owner-transfer-required");
      if(actorRole==="admin"&&previous!=="reviewer"&&previous!=="user")invalid("role-forbidden");
      if(previous===next)return {id:target.id,role:next,changed:false};
      await query("UPDATE users SET app_role=$2,updated_at=now() WHERE id=$1",[target.id,next]);
      if(next==="reviewer"||next==="admin")await userReviewerIdentity(target.id,true);
      else await userReviewerIdentity(target.id,false);
      await audit(actorId,target,next==="user"?"access_removed":"role_changed",previous,next,next==="user"?"access-removed-by-operator":"role-assigned-by-operator",{actorRole});
      return {id:target.id,role:next,changed:true};
    });
  },
  async bootstrapInitialOwner(emailValue:unknown,confirmedEmailValue:unknown){
    const email=typeof emailValue==="string"?emailValue.trim().toLowerCase():"";
    const confirmed=typeof confirmedEmailValue==="string"?confirmedEmailValue.trim().toLowerCase():"";
    if(!emailAddress.test(email)||email!==confirmed)invalid("owner-bootstrap-confirmation-required");
    return withDatabaseLock("admin:roles:v1",async()=>{
      const current=(await query("SELECT id FROM users WHERE app_role='owner' LIMIT 1 FOR UPDATE")).rows[0];
      if(current)invalid("initial-owner-already-assigned");
      const target=(await query("SELECT id,name,email,app_role FROM users WHERE email=$1 FOR UPDATE",[email])).rows[0];
      if(!target)invalid("user-not-found");
      if(target.app_role!=="user")invalid("bootstrap-target-must-be-user");
      await query("UPDATE users SET app_role='owner',updated_at=now() WHERE id=$1",[target.id]);
      await userReviewerIdentity(target.id,true);
      await audit(null,target,"initial_owner_bootstrap","user","owner","explicit-operator-bootstrap",{confirmationMatched:true});
      return {id:target.id,email:target.email,role:"owner" as const};
    });
  },
  async transferOwnership(actorId:string,targetIdValue:unknown){
    const targetId=typeof targetIdValue==="string"?targetIdValue:"";
    if(!uuid.test(targetId)||targetId===actorId)invalid("invalid-owner-transfer");
    return withDatabaseLock("admin:roles:v1",async()=>{
      const rows=(await query("SELECT id,name,email,app_role FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[actorId,targetId]])).rows;
      const current=rows.find(row=>row.id===actorId),target=rows.find(row=>row.id===targetId);
      if(!current||current.app_role!=="owner")invalid("role-forbidden");
      if(!target)invalid("user-not-found");
      const previous=target.app_role as AppRole;
      await query("UPDATE users SET app_role='admin',updated_at=now() WHERE id=$1",[actorId]);
      await query("UPDATE users SET app_role='owner',updated_at=now() WHERE id=$1",[targetId]);
      await userReviewerIdentity(targetId,true);
      await audit(actorId,target,"ownership_transferred",previous,"owner","explicit-owner-transfer",{formerOwnerId:actorId,formerOwnerRole:"admin"});
      await audit(actorId,current,"ownership_transferred","owner","admin","explicit-owner-transfer",{newOwnerId:targetId});
      return {ownerId:targetId,formerOwnerId:actorId};
    });
  },
};
