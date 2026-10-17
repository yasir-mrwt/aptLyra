import {expect,it} from 'vitest';
import {store} from './store';
import {editorialQueryCache} from '../services/editorialQueryCache';
it('clears saved route state and in-memory queries when the signed-in account changes',async()=>{
 store.dispatch({type:'auth/login/fulfilled',payload:{id:'account-a',name:'A'}});
 store.dispatch({type:'analytics/get/fulfilled',payload:{privateFixture:'account-a'}});
 await editorialQueryCache.load('http:/analytics',async()=>({privateFixture:'account-a'}));
 expect(store.getState().analytics.data).not.toBeNull();
 store.dispatch({type:'auth/login/fulfilled',payload:{id:'account-b',name:'B'}});
 expect(store.getState().auth.user?.id).toBe('account-b');
 expect(store.getState().analytics.data).toBeNull();
 expect(editorialQueryCache.get('http:/analytics').data).toBeUndefined();
 store.dispatch({type:'auth/logout/fulfilled'});
 expect(store.getState().auth.user).toBeNull();
});
