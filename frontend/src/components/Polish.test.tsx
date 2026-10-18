import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import CustomSelect from './CustomSelect';
import SessionCard from './SessionCard';
import PracticeLeaderboard from './PracticeLeaderboard';
import type {Session} from '../types/session';
const {get,put}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../services/apiClient',()=>({default:{get,put}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('uses a labeled keyboard-native select and preserves numeric option values',()=>{
 const change=vi.fn();render(<CustomSelect name="count" label="Question count" value={3} options={[3,5]} onChange={change}/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Question count'}),{target:{value:'5'}});expect(change).toHaveBeenCalledWith('count',5);
});
it('keeps history score primary and report/delete actions independent',()=>{
 const open=vi.fn(),remove=vi.fn();const session={_id:'one',role:'Backend Developer',status:'completed',overallScore:null,individualPractice:{mean:0,scored:1,total:2,unanswered:1,provisional:0}} as Session;
 render(<SessionCard session={session} onClick={open} onDelete={remove}/>);
 expect(screen.getByText('Individual practice score')).toBeTruthy();expect(screen.getByText(/1\/2 answers scored · 1 unanswered/)).toBeTruthy();
 expect(screen.getByText(/Reviewed aggregate: Not available/).closest('details')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Open report'}));expect(open).toHaveBeenCalledWith(session);
 fireEvent.click(screen.getByRole('button',{name:'Delete interview'}));expect(remove).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(1);
});
it('refetches leaderboard on invalidation without automatically opting in',async()=>{
 get.mockResolvedValue({data:{policy:'Reviewed only',reason:'Not participating',preference:{optedIn:false,displayName:''},groups:[]}});
 render(<PracticeLeaderboard/>);await screen.findByText('Not participating');
 window.dispatchEvent(new CustomEvent('aptlyra-data-invalidated',{detail:{prefix:'http:'}}));
 await waitFor(()=>expect(get).toHaveBeenCalledTimes(2));expect(put).not.toHaveBeenCalled();expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('does not present an unchosen role as a saved preference',()=>{
 render(<CustomSelect name="role" label="Preferred Role" value="" options={['Backend Developer','Frontend Developer']} onChange={vi.fn()}/>);
 expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
 expect(screen.getByRole('option',{name:'Choose preferred role'})).toBeTruthy();
});
