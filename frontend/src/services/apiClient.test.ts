import axios from 'axios';
import {afterEach,afterAll,it,expect,vi} from 'vitest';
import {editorialQueryCache} from './editorialQueryCache';
const transport=vi.fn();
const adapterSpy=vi.spyOn(axios,'getAdapter').mockReturnValue(transport);
const {default:api}=await import('./apiClient');
afterEach(()=>{transport.mockReset();editorialQueryCache.clear();localStorage.clear();});
afterAll(()=>adapterSpy.mockRestore());
it('replays a summary superseded by completion instead of showing an error or stale data',async()=>{
 localStorage.setItem('user',JSON.stringify({_id:'owner'}));
 let release!:()=>void;
 transport.mockImplementationOnce(config=>new Promise(resolve=>{release=()=>resolve({config,status:200,headers:{},data:'before completion'});}));
 transport.mockImplementationOnce(async config=>({config,status:200,headers:{},data:'after completion'}));
 const read=api.get('/analytics');await vi.waitFor(()=>expect(release).toBeDefined());
 editorialQueryCache.invalidatePrefix('http:');release();
 expect((await read).data).toBe('after completion');expect(transport).toHaveBeenCalledTimes(2);
});
it('does not replay an old account request after switching accounts',async()=>{
 localStorage.setItem('user',JSON.stringify({_id:'owner'}));
 let release!:()=>void;
 transport.mockImplementationOnce(config=>new Promise(resolve=>{release=()=>resolve({config,status:200,headers:{},data:'private old account'});}));
 const read=api.get('/analytics').catch(error=>error);await vi.waitFor(()=>expect(release).toBeDefined());
 localStorage.setItem('user',JSON.stringify({_id:'other'}));editorialQueryCache.setIdentity('other');release();
 expect(axios.isCancel(await read)).toBe(true);expect(transport).toHaveBeenCalledTimes(1);
});
it('deduplicates leaderboard reads, refreshes after preferences, and isolates accounts',async()=>{
 localStorage.setItem('user',JSON.stringify({_id:'owner'}));
 transport.mockImplementation(async config=>({config,status:200,headers:{},data:{owner:JSON.parse(localStorage.getItem('user')!)._id}}));
 await Promise.all([api.get('/gamification/leaderboard'),api.get('/gamification/leaderboard')]);
 expect(transport).toHaveBeenCalledTimes(1);
 await api.put('/user/profile',{name:'Private profile'});await api.get('/gamification/leaderboard');expect(transport).toHaveBeenCalledTimes(2);
 await api.put('/gamification/leaderboard',{optedIn:false,displayName:'Alias'});
 await api.get('/gamification/leaderboard');expect(transport).toHaveBeenCalledTimes(4);
 localStorage.setItem('user',JSON.stringify({_id:'other'}));
 expect((await api.get('/gamification/leaderboard')).data.owner).toBe('other');expect(transport).toHaveBeenCalledTimes(5);
});
