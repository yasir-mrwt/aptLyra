export interface ExecutionResult {
    runtime?:string;
    tests?: {passed:boolean;cases:{id:string;passed:boolean;expected:unknown;actual?:unknown;error?:string}[];error?:string};
    executionStatus?: "runtime-error"|"passed"|"failed-tests";
    stdout: string;
    stderr: string;
    exitCode: number;
    signal: string | null;
    timedOut: boolean;
    cpuTime?: string;
    memory?: string;
}
