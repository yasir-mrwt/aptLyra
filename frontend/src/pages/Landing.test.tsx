import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import Landing from './Landing';
const state=vi.hoisted(()=>({auth:{user:null as null|{id:string;name:string},isInitializing:false}}));
vi.mock('react-redux',()=>({useSelector:(select:(s:typeof state)=>unknown)=>select(state)}));
vi.mock('../components/NewInterviewForm',()=>({default:()=> <form aria-label="Real planner"><button>Preview interview plan</button></form>}));
afterEach(()=>{cleanup();state.auth.user=null;});
it('guests get a complete homepage and join/login links without a protected planner',()=>{
 render(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.getByRole('heading',{name:/Practice with evidence/})).toBeTruthy();
 expect(screen.queryByRole('form',{name:'Real planner'})).toBeNull();
 expect(screen.getByRole('link',{name:'Join & plan an interview'}).getAttribute('href')).toBe('/register');
 expect(screen.getAllByRole('link',{name:'Log in'})[0].getAttribute('href')).toBe('/login');
 fireEvent.click(screen.getByRole('button',{name:'2. Reasoning'}));
 expect(screen.getByRole('button',{name:'2. Reasoning'}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByText('Make your reasoning visible')).toBeTruthy();
});
it('signed-in homepage mounts the actual planner entry without a history wall',()=>{
 state.auth.user={id:'fixture',name:'Fixture'};render(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.getByRole('form',{name:'Real planner'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Preview interview plan'})).toBeTruthy();
 expect(screen.getByRole('link',{name:'History'}).getAttribute('href')).toBe('/history');
});
