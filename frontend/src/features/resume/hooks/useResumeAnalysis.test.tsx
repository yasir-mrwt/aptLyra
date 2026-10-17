import {renderHook,waitFor,act,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {useResumeAnalysis} from './useResumeAnalysis';
const {getResume,getResumeStatus}=vi.hoisted(()=>({getResume:vi.fn(),getResumeStatus:vi.fn()}));
vi.mock('../../../services/resumeApi',()=>({getResume,getResumeStatus}));
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear();});
it('restores only the current user’s saved job after navigation',async()=>{
 localStorage.setItem('aptlyra-resume:owner','saved');localStorage.setItem('aptlyra-resume:other','private-other');
 getResume.mockResolvedValue({_id:'saved',status:'completed'});
 const {result}=renderHook(()=>useResumeAnalysis({userId:'owner'}));
 await waitFor(()=>expect(result.current.resumeData?._id).toBe('saved'));
 expect(getResume).toHaveBeenCalledWith('saved');expect(getResume).not.toHaveBeenCalledWith('private-other');
 expect(result.current.isUploading).toBe(false);
});
it('a just-uploaded job is not cleared by delayed initial restoration',async()=>{
 getResume.mockResolvedValue({_id:'fresh',status:'processing'});
 const {result}=renderHook(()=>useResumeAnalysis({userId:'owner'}));
 await act(async()=>{await result.current.fetchResumeDetails('fresh');});
 await new Promise(resolve=>setTimeout(resolve,10));
 expect(result.current.activeId).toBe('fresh');expect(result.current.isUploading).toBe(true);
 expect(localStorage.getItem('aptlyra-resume:owner')).toBe('fresh');
});
