import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import Landing from './Landing';
const state=vi.hoisted(()=>({auth:{user:null as null|{id:string;name:string},isInitializing:false},role:{userId:null as string|null,status:"ready",canReview:false}}));
vi.mock('react-redux',()=>({useSelector:(select:(s:typeof state)=>unknown)=>select(state)}));
vi.mock('../components/HeroAnimation',()=>({default:()=> <img alt="A speaker explains an idea"/>}));
vi.mock('../components/NewInterviewForm',()=>({default:()=> <form aria-label="Real planner"><button>Preview interview plan</button></form>}));
afterEach(()=>{cleanup();state.auth.user=null;state.role.userId=null;state.role.canReview=false;});
it('guests get a complete homepage and join/login links without a protected planner',()=>{
 render(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.getByRole('heading',{name:/Your next interview/})).toBeTruthy();
 expect(screen.queryByRole('form',{name:'Real planner'})).toBeNull();
 expect(screen.getByRole('link',{name:'Join & plan an interview'}).getAttribute('href')).toBe('/register');
 expect(screen.getAllByRole('link',{name:'Log in'})[0].getAttribute('href')).toBe('/login');
 expect(screen.getByRole('img',{name:/speaker explains an idea/})).toBeTruthy();
});
it('signed-in homepage mounts the actual planner entry without a history wall',()=>{
 state.auth.user={id:'fixture',name:'Fixture'};render(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.getByRole('form',{name:'Real planner'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Preview interview plan'})).toBeTruthy();
 expect(screen.getByRole('link',{name:'History'}).getAttribute('href')).toBe('/history');
 expect(screen.getByRole('link',{name:/Share a question/}).getAttribute('href')).toBe('/share-interview-experience');
 expect(screen.queryByRole('link',{name:/Review questions/})).toBeNull();
});

it('reviewer shortcut requires verified access for the current account',()=>{
 state.auth.user={id:'fixture',name:'Fixture'};state.role.canReview=true;state.role.userId='different-user';
 const view=render(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.queryByRole('link',{name:/Review questions/})).toBeNull();
 state.role.userId='fixture';view.rerender(<MemoryRouter><Landing/></MemoryRouter>);
 expect(screen.getByRole('link',{name:/Review questions/}).getAttribute('href')).toBe('/content-editorial');
 expect(screen.getByText('© 2026 Aptlyra. All rights reserved.')).toBeTruthy();
 expect(screen.queryByText(/Original Aptlyra work by/)).toBeNull();
});
