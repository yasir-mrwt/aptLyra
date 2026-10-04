export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    signal: string | null;
    timedOut: boolean;
    cpuTime?: string;
    memory?: string;
}
