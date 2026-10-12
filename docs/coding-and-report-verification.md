# Coding answers and report exports

Coding answers have separate code and explanation fields. Explanation uses the existing answer-text persistence contract; code uses code-text. IndexedDB preserves both across navigation/reload. Both are submitted independently and stay separate in evaluation and reports. Existing rubric boundaries and reviewed aggregate rules are unchanged.

Python uses JDoodle `python3` version index `6`, verified with the configured provider as Python 3.14.3. Index `0` was Python 3.5.1 and failed `list[int]` annotations. User code is never stripped or rewritten. JavaScript retains its existing provider version; generated test harnesses are compatible with it. See [JDoodle compiler API](https://www.jdoodle.com/compiler-api) for the version-index contract.

Only exact content-hash-matched trusted prompts enable these deterministic tests:

| Prompt | JavaScript function | Python function | Cases |
| --- | --- | --- | --- |
| Binary search | `binarySearch(arr, target)` | `binary_search(arr, target)` | Found index, missing value, empty array |
| First repeated value on left-to-right scan | `firstRepeated(values)` | `first_repeated(values)` | Encounter order, unique, empty, zero, negative |

Binary search returns `-1` when missing. First repeated returns `null`/`undefined` in JS or `None` in Python when unique. Unsupported questions remain answerable without Run. Runtime errors are distinct from failed assertions; the output lists each case. Passing two of three cases is a failed test run.

Reports distinguish individual practice scores from the reviewed aggregate. Established starter feedback can have a numeric score while reviewed coverage remains zero. Dynamic practice feedback remains provisional or abstained without invented reviewed evidence. Coding execution is reported only for the matching submitted code hash/language; oral answers are not code execution.

Report Card PDF paginates long answers and code without truncating them. Export Report uses dedicated print rules. To check: submit code plus explanation, reload the report, download both exports, and inspect every page for readable text, preserved indentation and consistent scores/status.
