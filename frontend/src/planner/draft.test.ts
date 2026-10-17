import {it,expect} from 'vitest';
import {isPlannerDraft,setupError} from './contracts';
it('restores an incomplete unsent draft without treating it as submit-ready',()=>{
 const draft={role:'Full Stack Developer',level:'junior',taxonomyVersion:'junior-se-v1',competencies:[],difficulty:'standard',mode:'mixed',count:0,minutes:30,language:'en',codeLanguage:'python',modifiers:{},repeatPolicy:'only-new'};
 expect(isPlannerDraft(draft)).toBe(true);expect(setupError(draft as Parameters<typeof setupError>[0])).toBeTruthy();
 expect(isPlannerDraft({...draft,codeLanguage:'unknown'})).toBe(false);
});
