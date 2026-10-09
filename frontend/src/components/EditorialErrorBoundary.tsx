import { Component, type ReactNode } from "react";

type Props={children:ReactNode;fallback?:ReactNode;compact?:boolean};
type State={failed:boolean};

export default class EditorialErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(){/* Keep source or review payloads out of client logs. */}
  render(){
    if(!this.state.failed)return this.props.children;
    return this.props.fallback||<section role="alert" className="rounded-xl border border-amber-300/30 bg-slate-900/70 p-5 text-sm text-amber-100">
      <p>This editorial section could not be displayed. Your other Aptlyra pages are still available.</p>
      <button type="button" className="mt-3 rounded border border-amber-200/30 px-3 py-2" onClick={()=>this.setState({failed:false})}>Retry section</button>
    </section>;
  }
}

export class SourceRowErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(){/* Isolate the malformed row without logging its source text. */}
  render(){return this.state.failed?<p role="alert" className="rounded border border-amber-300/20 p-3 text-sm">This source could not be displayed. Reload the source list to retry.</p>:this.props.children;}
}
