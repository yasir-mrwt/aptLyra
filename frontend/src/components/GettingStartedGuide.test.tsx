import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import GettingStartedGuide from './GettingStartedGuide';
afterEach(cleanup);
it('keeps the four public steps available and coding conditional',()=>{
 render(<MemoryRouter><GettingStartedGuide signedIn={false} onStart={vi.fn()}/></MemoryRouter>);
 expect(screen.getByRole('list').children).toHaveLength(4);
 expect(screen.getByText(/When coding is included/)).toBeTruthy();
 expect(screen.getByText(/not a professional certification/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'Get Started'}).getAttribute('href')).toBe('/register');
});
it('takes an authenticated visitor to the existing planner',()=>{
 const start=vi.fn();render(<MemoryRouter><GettingStartedGuide signedIn onStart={start}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Start an Interview'}));expect(start).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('link',{name:'Get Started'})).toBeNull();
});
