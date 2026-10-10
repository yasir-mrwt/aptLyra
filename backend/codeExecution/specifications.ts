export type ExecutionTestId="binary-search-v1";
export type ExecutionCaseResult={id:string;passed:boolean;expected:number;actual?:unknown};
export type ExecutionTestResult={passed:boolean;cases:ExecutionCaseResult[]};

const marker="__APTLYRA_TEST_RESULTS__";
// SHA-256 of the exact trusted seed prompt. Ingestion stores question identity as a
// generated family key, so executable eligibility must use the immutable content hash.
export const BINARY_SEARCH_TEST_CONTENT_HASH="ac0eecf2e0c1622ad065077248fe0c03edd68acaa72a5d5facdcef0e030daf7f";

export function executionTestFor(inventoryClass:string,contentHash:string,category:string,language:string):ExecutionTestId|null {
  if(inventoryClass!=="TRUSTED_BASELINE"||contentHash!==BINARY_SEARCH_TEST_CONTENT_HASH||category!=="coding")return null;
  return language==="javascript"||language==="python"?"binary-search-v1":null;
}

export function canonicalCodeLanguage(value:string):string {
  const normalized=value.trim().toLowerCase();
  if(["js","node","nodejs"].includes(normalized))return "javascript";
  if(["py","python3"].includes(normalized))return "python";
  return normalized;
}

export function withBinarySearchTests(code:string,language:string):string {
  if(language==="javascript")return `${code}\n;(()=>{\n  const cases=[\n    {id:"match",input:[[1,3,5,7,9],7],expected:3},\n    {id:"missing",input:[[1,3,5,7,9],2],expected:-1},\n    {id:"empty",input:[[],3],expected:-1}\n  ];\n  try { const results=cases.map(test=>{const actual=binarySearch(...test.input);return {id:test.id,expected:test.expected,actual,passed:actual===test.expected};});\n    console.log("${marker}"+JSON.stringify({cases:results}));\n  } catch(error) { console.log("${marker}"+JSON.stringify({error:String(error),cases:cases.map(test=>({id:test.id,expected:test.expected,passed:false}))})); }\n})();`;
  if(language==="python")return `${code}\n\nimport json as __aptlyra_json\ntry:\n    __aptlyra_cases = [\n        {"id": "match", "input": ([1, 3, 5, 7, 9], 7), "expected": 3},\n        {"id": "missing", "input": ([1, 3, 5, 7, 9], 2), "expected": -1},\n        {"id": "empty", "input": ([], 3), "expected": -1},\n    ]\n    __aptlyra_results = []\n    for __test in __aptlyra_cases:\n        __actual = binary_search(*__test["input"])\n        __aptlyra_results.append({"id": __test["id"], "expected": __test["expected"], "actual": __actual, "passed": __actual == __test["expected"]})\n    print("${marker}" + __aptlyra_json.dumps({"cases": __aptlyra_results}))\nexcept Exception as __error:\n    print("${marker}" + __aptlyra_json.dumps({"error": str(__error), "cases": [{"id": test["id"], "expected": test["expected"], "passed": False} for test in __aptlyra_cases]}))`;
  throw new Error("Unsupported binary-search test language");
}

export function parseBinarySearchResults(output:string):{userOutput:string;result:ExecutionTestResult|null} {
  const index=output.lastIndexOf(marker);
  if(index<0)return {userOutput:output,result:null};
  const raw=output.slice(index+marker.length).trim().split(/\r?\n/,1)[0];
  try {
    const parsed=JSON.parse(raw) as {cases?:ExecutionCaseResult[]};
    if(!Array.isArray(parsed.cases)||parsed.cases.length!==3||parsed.cases.some(item=>
      typeof item.id!=="string"||typeof item.passed!=="boolean"||typeof item.expected!=="number"))return {userOutput:output.slice(0,index).trim(),result:null};
    return {userOutput:output.slice(0,index).trim(),result:{passed:parsed.cases.every(item=>item.passed),cases:parsed.cases}};
  } catch { return {userOutput:output.slice(0,index).trim(),result:null}; }
}
