export type ExecutionTestId="binary-search-v1"|"first-repeated-v1"|"collapse-repeats-v1"|"group-words-v1";
export type ExecutionCaseResult={id:string;passed:boolean;expected:unknown;actual?:unknown;error?:string};
export type ExecutionTestResult={passed:boolean;cases:ExecutionCaseResult[];error?:string};

const marker="__APTLYRA_TEST_RESULTS__";
// SHA-256 of the exact trusted seed prompt. Ingestion stores question identity as a
// generated family key, so executable eligibility must use the immutable content hash.
export const BINARY_SEARCH_TEST_CONTENT_HASH="ac0eecf2e0c1622ad065077248fe0c03edd68acaa72a5d5facdcef0e030daf7f";

export const FIRST_REPEATED_TEST_CONTENT_HASH="eec634c6c2c0e466d80cb73d2da7c5b25d4dc1c04ce4e24be0804202f087c720";

export function executionTestFor(inventoryClass:string,contentHash:string,category:string,language:string):ExecutionTestId|null {
  if(inventoryClass!=="TRUSTED_BASELINE"||category!=="coding"||!["javascript","python"].includes(language))return null;
  if(contentHash===BINARY_SEARCH_TEST_CONTENT_HASH)return "binary-search-v1";
  if(contentHash===FIRST_REPEATED_TEST_CONTENT_HASH)return "first-repeated-v1";
  if(contentHash==="c72647165326891837d05a55ab7285293533345cdf29c8290aa1d884c300a3c6")return "collapse-repeats-v1";
  if(contentHash==="1791c42417788af46051abf6bd228b3dd47e14c36af287a13cc80a762961423a")return "group-words-v1";
  return null;
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

export function parseBinarySearchResults(output:string,testId:ExecutionTestId="binary-search-v1"):{userOutput:string;result:ExecutionTestResult|null} {
  const index=output.lastIndexOf(marker);
  if(index<0)return {userOutput:output,result:null};
  const raw=output.slice(index+marker.length).trim().split(/\r?\n/,1)[0];
  try {
    const parsed=JSON.parse(raw) as {cases?:ExecutionCaseResult[];error?:string};
    if(!Array.isArray(parsed.cases)||parsed.cases.length!==executionCaseCount(testId)||parsed.cases.some(item=>
      typeof item.id!=="string"||typeof item.passed!=="boolean"))return {userOutput:output.slice(0,index).trim(),result:null};
    const runtimeError=parsed.error||parsed.cases.find(item=>item.error)?.error;
    return {userOutput:output.slice(0,index).trim(),result:{passed:!runtimeError&&parsed.cases.every(item=>item.passed),cases:parsed.cases,...(runtimeError?{error:String(runtimeError).slice(0,1000)}:{})}};
  } catch { return {userOutput:output.slice(0,index).trim(),result:null}; }
}

export function withExecutionTests(code:string,language:string,testId:ExecutionTestId):string {
  if(testId==="binary-search-v1")return withBinarySearchTests(code,language);
  if(testId==="collapse-repeats-v1" || testId==="group-words-v1")return withCollectionTests(code,language,testId);
  const cases=[{id:"encounter-order",input:[[4,2,2,4]],expected:2},{id:"unique",input:[[1,2,3]],expected:null},
    {id:"empty",input:[[]],expected:null},{id:"zero",input:[[0,1,0]],expected:0},{id:"negative",input:[[-2,3,-2,3]],expected:-2}];
  if(language==="javascript")return `${code}\n;(()=>{const cases=${JSON.stringify(cases)};const results=cases.map(test=>{try{const actual=firstRepeated(...test.input);return {id:test.id,expected:test.expected,actual:actual==null?null:actual,passed:test.expected===null?actual==null:actual===test.expected};}catch(error){return {id:test.id,expected:test.expected,passed:false,error:String(error)};}});console.log("${marker}"+JSON.stringify({cases:results}));})();`;
  if(language==="python")return `${code}\nimport json as __aptlyra_json\n__aptlyra_cases=__aptlyra_json.loads('${JSON.stringify(cases)}')\n__aptlyra_results=[]\nfor __test in __aptlyra_cases:\n    try:\n        __actual=first_repeated(*__test["input"])\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"actual":__actual,"passed":__actual==__test["expected"]})\n    except Exception as __error:\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"passed":False,"error":str(__error)})\nprint("${marker}"+__aptlyra_json.dumps({"cases":__aptlyra_results}))`;
  throw new Error("Unsupported execution language");
}

/** Multipart text fields use CRLF; normalize only evidence identity, never stored or executed code. */
export const normalizedExecutionCode=(code:string)=>code.replace(/\r\n/g,"\n");

export const executionCaseCount=(id:ExecutionTestId)=>id==="binary-search-v1"?3:id==="collapse-repeats-v1"?4:5;
const collectionCases={
 "collapse-repeats-v1":[{id:"runs",input:"aaabbcca",expected:"abca"},{id:"empty",input:"",expected:""},{id:"single",input:"x",expected:"x"},{id:"separated",input:"ababa",expected:"ababa"}],
 "group-words-v1":[{id:"ordered",input:["cat","a","dog","to","ant"],expected:{"1":["a"],"2":["to"],"3":["cat","dog","ant"]}},
 {id:"empty",input:[],expected:{}},{id:"empty-word",input:["","a",""],expected:{"0":["",""],"1":["a"]}},
 {id:"duplicates",input:["go","to","go"],expected:{"2":["go","to","go"]}},{id:"mixed",input:["four","x","two"],expected:{"1":["x"],"3":["two"],"4":["four"]}}]
};
function withCollectionTests(code:string,language:string,id:"collapse-repeats-v1"|"group-words-v1"):string {
 const cases=collectionCases[id],group=id==="group-words-v1";
 const js=group?"groupWordsByLength":"removeConsecutiveRepeats",py=group?"group_words_by_length":"remove_consecutive_repeats";
 if(language==="javascript")return `${code}\n;(()=>{const cases=${JSON.stringify(cases)};const results=cases.map(test=>{try{let actual=${js}(test.input);if(actual instanceof Map){const mapped={};actual.forEach((value,key)=>{mapped[key]=value;});actual=mapped;}const keys=actual&&typeof actual==='object'?Object.keys(actual).sort():[];const expectedKeys=typeof test.expected==='object'?Object.keys(test.expected).sort():[];const passed=typeof test.expected==='string'?actual===test.expected:JSON.stringify(keys)===JSON.stringify(expectedKeys)&&keys.every(key=>JSON.stringify(actual[key])===JSON.stringify(test.expected[key]));return {id:test.id,expected:test.expected,actual,passed};}catch(error){return {id:test.id,expected:test.expected,passed:false,error:String(error)};}});console.log("${marker}"+JSON.stringify({cases:results}));})();`;
 if(language==="python")return `${code}\nimport json as __aptlyra_json\n__aptlyra_cases=__aptlyra_json.loads('${JSON.stringify(cases)}')\n__aptlyra_results=[]\nfor __test in __aptlyra_cases:\n    try:\n        __actual=${py}(__test["input"])\n        __actual=__aptlyra_json.loads(__aptlyra_json.dumps(__actual))\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"actual":__actual,"passed":__actual==__test["expected"]})\n    except Exception as __error:\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"passed":False,"error":str(__error)})\nprint("${marker}"+__aptlyra_json.dumps({"cases":__aptlyra_results}))`;
 throw new Error("Unsupported execution language");
}
