import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "../../app/store";
import { DesktopNav } from "../../components/header/DesktopNav";
import { MobileNav } from "../../components/header/MobileNav";

afterEach(cleanup);

describe("role-aware navigation",()=>{
  it.each([
    ["owner",true,true],
    ["admin",true,true],
    ["reviewer",true,false],
    ["user",false,false],
  ] as const)("shows only authorized links for %s",(role,editorial,team)=>{
    render(<Provider store={store}><MemoryRouter><DesktopNav user={{name:"Test"}} isActive={()=>false} onOpenModal={()=>undefined} role={role} roleLoading={false}/></MemoryRouter></Provider>);
    expect(screen.queryByRole("link",{name:"Editorial Review"})!==null).toBe(editorial);
    expect(screen.queryByRole("link",{name:"Team Access"})!==null).toBe(team);
  });

  it("keeps restricted mobile links hidden until role hydration completes",()=>{
    render(<Provider store={store}><MemoryRouter><MobileNav user={{name:"Test"}} isOpen onToggle={()=>undefined} onClose={()=>undefined} isActive={()=>false} onOpenModal={()=>undefined} role={null} roleLoading/></MemoryRouter></Provider>);
    expect(screen.getByLabelText("Loading account navigation")).toBeTruthy();
    expect(screen.queryByRole("link",{name:"Editorial Review"})).toBeNull();
  });
});
