# Seed corpus editorial review packet

Status: **48 original AI-assisted drafts; human review pending.** No reviewer is invented. This is locally authored selection material, not external company evidence or a reviewed rubric.

Exact file SHA-256: `b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995`.

Review all questions and context for correctness, junior scope, mapping, duplicates, rights, PII and confidentiality. Approval must explicitly attest this exact file and name the actual human reviewer. Corrections require a new hash and review. No automatic publication.

All questions support Software Engineer, Backend Developer and Full Stack Developer. No company labels or occurrence dates are asserted.

## dsa.structures-1

conceptual-oral / easy / `dsa.structures`

Compare a stack and a queue using undo history and a waiting line as examples. Which operation order does each preserve?

Editorial context (draft, not a reviewed rubric): A stack removes the most recently added item; a queue removes the earliest. The examples illustrate LIFO and FIFO without assuming a particular implementation.

## dsa.structures-2

coding / standard / `dsa.structures`

In Python or JavaScript, return the first repeated value in an array of integers, scanning from left to right. Return no result when all values are unique. Explain the time and extra space costs.

Editorial context (draft, not a reviewed rubric): A set of seen values detects the first repeated occurrence during the scan. Average linear time assumes expected constant-time set membership; auxiliary space is linear in distinct values.

## dsa.complexity-1

conceptual-oral / easy / `dsa.complexity`

An algorithm scans n values once and then scans them once again. Explain its time complexity and why two consecutive scans differ from two nested scans.

Editorial context (draft, not a reviewed rubric): Sequential linear scans total linear time. Fully nested independent scans total quadratic time; constants do not change the asymptotic order.

## dsa.complexity-2

scenario / stretch / `dsa.complexity`

A service can sort a list once and use binary search for many lookups, or scan the unsorted list for every lookup. Explain how n items and m lookups affect the choice, including preprocessing and space.

Editorial context (draft, not a reviewed rubric): Compare sorting plus m logarithmic searches against m linear scans. Include update frequency and whether a sorted copy is needed; no fixed winner exists for all n and m.

## dsa.search-sort-1

coding / standard / `dsa.search-sort`

Implement binary search in Python or JavaScript for a sorted ascending array of distinct integers. Return the matching index or -1. Include empty-array and missing-value cases.

Editorial context (draft, not a reviewed rubric): Maintain a shrinking interval and avoid repeating the midpoint. Binary search is logarithmic time; iteration can use constant auxiliary space.

## dsa.search-sort-2

debugging / stretch / `dsa.search-sort`

A binary search loop updates low to mid when the target exceeds the middle value, while its condition is low less than or equal to high. Show an input that fails to make progress and explain a repair.

Editorial context (draft, not a reviewed rubric): The middle element has already been ruled out. Advancing low to mid plus one prevents a one-element or two-element interval from remaining unchanged.

## oop.encapsulation-1

conceptual-oral / easy / `oop.encapsulation`

Why might a BankBalance object expose deposit and withdraw methods rather than a freely writable balance field? Describe an invariant and a limitation of this approach.

Editorial context (draft, not a reviewed rubric): Controlled methods can preserve a nonnegative balance invariant, but encapsulation alone does not solve concurrent updates, validation of every input or persistence failures.

## oop.encapsulation-2

scenario / standard / `oop.encapsulation`

A shopping cart exposes its internal mutable items array. A caller removes entries without updating the total. Propose an interface that protects consistency and explain how callers can inspect items.

Editorial context (draft, not a reviewed rubric): Hide mutation behind cart operations and return a copy or read-only view. Ensure totals are computed from authoritative items or updated atomically with every supported mutation.

## oop.polymorphism-1

conceptual-oral / easy / `oop.polymorphism`

Two payment processors implement the same charge interface. Explain how a checkout function can use either processor without checking its concrete class.

Editorial context (draft, not a reviewed rubric): The function depends on the interface contract. Implementations may differ internally but must preserve expected inputs, outputs and failure semantics.

## oop.polymorphism-2

debugging / standard / `oop.polymorphism`

A subclass replaces a method that returns a result with one that silently returns no result on valid input. Why can code written for the base class break, and how would you repair the contract?

Editorial context (draft, not a reviewed rubric): Substitution requires preserving the promised behavior, not just matching a method name. Restore compatible results or use a separate interface for materially different behavior.

## oop.composition-1

conceptual-oral / easy / `oop.composition`

Explain composition using a report generator that receives a formatter object. How does this differ from making every report type inherit a formatter class?

Editorial context (draft, not a reviewed rubric): Composition delegates formatting to a collaborator and can make behavior replaceable. Inheritance couples the subtype to the base implementation and should reflect a valid behavioral relationship.

## oop.composition-2

scenario / stretch / `oop.composition`

A notification class hierarchy has EmailWithLogging, EmailWithRetry, SmsWithLogging and SmsWithRetry subclasses. Propose a simpler composition-based design and name one trade-off.

Editorial context (draft, not a reviewed rubric): Compose channel delivery with logging and retry collaborators or wrappers. This reduces combinations of subclasses but introduces explicit wiring and requires clear wrapper ordering.

## dbms-sql.queries-1

sql / standard / `dbms-sql.queries`

Given customers(id) and orders(id, customer_id, total), write a PostgreSQL query returning every customer ID and its order count, including customers with zero orders. Explain which column you count.

Editorial context (draft, not a reviewed rubric): Use a left join grouped by customer ID and COUNT of the non-null order ID. COUNT(*) would count the placeholder row for customers without orders.

## dbms-sql.queries-2

sql / stretch / `dbms-sql.queries`

Given purchases(id, customer_id, amount, paid_at), write a PostgreSQL query for customers with at least two paid purchases and a paid total above 100. Ignore unpaid purchases whose paid_at is NULL. Explain WHERE versus HAVING.

Editorial context (draft, not a reviewed rubric): WHERE filters paid rows using IS NOT NULL before grouping. HAVING applies count and sum conditions to each customer group; ordinary equality to NULL is unsuitable.

## dbms-sql.modeling-1

conceptual-oral / easy / `dbms-sql.modeling`

Explain primary and foreign keys using students, courses and course enrollments. How can the schema prevent the same student enrolling in the same course twice?

Editorial context (draft, not a reviewed rubric): Keys identify rows and foreign keys preserve references. A unique pair of student and course IDs or a composite primary key prevents duplicate enrollments.

## dbms-sql.modeling-2

scenario / standard / `dbms-sql.modeling`

An orders table repeats customer name and current contact details in every row. Explain one update anomaly and distinguish a deliberate historical shipping snapshot from accidental duplication.

Editorial context (draft, not a reviewed rubric): Repeated current data can diverge across rows. A normalized customer relation avoids this; an explicit immutable order-time shipping snapshot has different semantics and may be appropriate.

## dbms-sql.transactions-indexes-1

scenario / standard / `dbms-sql.transactions-indexes`

A transfer debits one account and credits another in separate database commits. What happens if the second operation fails, and how does a transaction help? Name another control needed for concurrent transfers.

Editorial context (draft, not a reviewed rubric): A single transaction can commit both operations or roll both back. Concurrent balance changes still require suitable locking, isolation or conditional updates to preserve invariants.

## dbms-sql.transactions-indexes-2

conceptual-oral / easy / `dbms-sql.transactions-indexes`

Why can an index speed up a selective lookup but slow down inserts? Explain why an index is not guaranteed to improve every query.

Editorial context (draft, not a reviewed rubric): An index reduces some search work but must be maintained on writes and uses storage. Selectivity, query shape and the optimizer affect whether scanning is cheaper.

## os.process-thread-1

conceptual-oral / easy / `os.process-thread`

Compare a process and a thread in terms of address space and shared resources. Why does an error in one thread sometimes affect the whole process?

Editorial context (draft, not a reviewed rubric): Threads in one process share its address space while processes normally have separate address spaces. Shared memory corruption or process termination can affect all threads.

## os.process-thread-2

scenario / standard / `os.process-thread`

A program performs CPU-heavy work while another task waits for network input. Explain how concurrency can help responsiveness and why adding threads does not guarantee faster CPU computation.

Editorial context (draft, not a reviewed rubric): Scheduling can overlap waiting with other work. CPU capacity, runtime constraints, synchronization and thread overhead limit computation speedups.

## os.memory-1

conceptual-oral / easy / `os.memory`

Explain the difference between a local variable with stack-like lifetime and an object allocated on the heap. Why should a language runtime affect your explanation?

Editorial context (draft, not a reviewed rubric): Stack frames have call-related lifetime; heap objects may outlive a call. Allocation details and garbage collection depend on the language and implementation, so universal claims are unsafe.

## os.memory-2

debugging / standard / `os.memory`

A long-running service keeps every request result in an in-memory map and never removes entries. Memory usage grows despite garbage collection. Explain the cause and propose a bounded policy.

Editorial context (draft, not a reviewed rubric): Reachable map entries are not collectible. Limit size or use expiry with eviction and account for key growth; garbage collection does not define the application retention policy.

## os.synchronization-1

scenario / standard / `os.synchronization`

Two threads read a shared counter, add one and write it back. Show an interleaving that loses an increment and explain a synchronization option.

Editorial context (draft, not a reviewed rubric): Both can read the same old value before either writes. A suitable mutex or atomic increment makes the read-modify-write operation indivisible at the required scope.

## os.synchronization-2

debugging / stretch / `os.synchronization`

Task A locks resource X then waits for Y; task B locks Y then waits for X. Explain the deadlock and propose a consistent lock-order policy.

Editorial context (draft, not a reviewed rubric): Each task waits for a resource held by the other. A common global ordering prevents this cycle when every participant follows it; timeout handling must still release acquired resources.

## networks.transport-1

conceptual-oral / easy / `networks.transport`

Compare TCP and UDP for ordered delivery, reliability and message boundaries. Why might an application still need its own acknowledgements over TCP?

Editorial context (draft, not a reviewed rubric): TCP supplies an ordered reliable byte stream, while UDP preserves datagrams without delivery guarantees. Transport delivery alone does not confirm application processing or durable commit.

## networks.transport-2

scenario / standard / `networks.transport`

A client loses its connection after sending a purchase request and before receiving a response. Why is retrying not proof that the first request failed, and what application mechanism can prevent duplicate purchases?

Editorial context (draft, not a reviewed rubric): The server may have committed before the response was lost. A persisted idempotency key can make retries return the original outcome rather than duplicate the business effect.

## networks.http-dns-1

conceptual-oral / easy / `networks.http-dns`

Describe the main steps from entering an HTTPS URL to receiving an HTTP response. Include DNS, the transport connection and TLS, and mention where caching may skip a step.

Editorial context (draft, not a reviewed rubric): Resolve the host if needed, establish or reuse a transport connection, negotiate or reuse secure transport and exchange HTTP data. Caches and connection reuse can avoid fresh work.

## networks.http-dns-2

debugging / standard / `networks.http-dns`

A browser receives HTTP 404 for one API path while the same host serves its health endpoint. Distinguish this from a DNS failure and propose two checks.

Editorial context (draft, not a reviewed rubric): An HTTP response means the request reached an HTTP responder. Check the registered route and method plus proxy base paths; DNS resolution failures occur before such a response.

## networks.tls-basics-1

conceptual-oral / easy / `networks.tls-basics`

What does HTTPS protect in transit, and what does a valid server certificate help establish? Name something HTTPS does not guarantee about application data.

Editorial context (draft, not a reviewed rubric): TLS protects transport confidentiality and integrity and authenticates a server identity under a trust model. It does not guarantee truthful content, authorization or safe storage at endpoints.

## networks.tls-basics-2

scenario / stretch / `networks.tls-basics`

An API client works only when certificate verification is disabled. Explain why keeping that setting is risky and describe a safer diagnosis.

Editorial context (draft, not a reviewed rubric): Disabling verification can admit impersonation. Inspect hostname, chain, expiry, system time and trusted roots rather than bypassing identity checks permanently.

## backend-web.api-contracts-1

scenario / standard / `backend-web.api-contracts`

Design a paginated GET endpoint for a user’s notes. Specify request parameters, a response shape, validation and a stable ordering that avoids ambiguous page boundaries.

Editorial context (draft, not a reviewed rubric): Bound page size and define an ordering with a unique tie-breaker. Cursor or offset semantics should be explicit, with owned-resource filtering enforced server-side.

## backend-web.api-contracts-2

conceptual-oral / easy / `backend-web.api-contracts`

Explain the usual purpose of HTTP 201, 400, 401, 403 and 409 in an API. Give a case where a resource-ownership check changes the response.

Editorial context (draft, not a reviewed rubric): 201 indicates creation, 400 invalid input, 401 missing or invalid authentication, 403 denied access and 409 conflict. Some APIs deliberately return 404 to conceal unowned resource existence.

## backend-web.auth-validation-1

debugging / standard / `backend-web.auth-validation`

An authenticated endpoint updates a note selected only by note ID from the request. Explain how one user could modify another user’s note and show the missing authorization condition.

Editorial context (draft, not a reviewed rubric): Authentication establishes identity, not permission over every record. Scope the update by both note ID and authenticated owner; do not trust an owner ID supplied by the client.

## backend-web.auth-validation-2

scenario / standard / `backend-web.auth-validation`

A profile update accepts every field in the request body, including isAdmin. Propose input validation and an update strategy that prevents privilege changes.

Editorial context (draft, not a reviewed rubric): Allowlist editable fields, validate their types and bounds, and construct the update from those fields. Privileged fields need a separate authorized administrative boundary.

## backend-web.persistence-jobs-1

scenario / stretch / `backend-web.persistence-jobs`

A job worker sends a notification and crashes before recording completion. Explain why a retry may send twice and describe a practical idempotency strategy and its limits.

Editorial context (draft, not a reviewed rubric): Persist a stable operation identity and use provider idempotency when available. SQL and an external side effect are not automatically atomic; explicitly describe possible duplicate delivery or recovery limits.

## backend-web.persistence-jobs-2

debugging / standard / `backend-web.persistence-jobs`

A product price is updated in PostgreSQL, but an API keeps serving an old cached value. Propose an invalidation strategy and explain how a cache failure should affect correctness.

Editorial context (draft, not a reviewed rubric): Invalidate or version cached entries after authoritative commits and use bounded TTLs. The database remains authoritative; cache failures should not replace a successful durable update with stale truth.

## design-lite.requirements-1

system-design-lite / easy / `design-lite.requirements`

Sketch a small library borrowing service. First state assumptions about borrowers, available copies and returning a book, then identify the client, API and datastore.

Editorial context (draft, not a reviewed rubric): Clarify the product before choosing components. Model individual copies or inventory counts and a loan lifecycle; the sketch should show the authoritative source of availability.

## design-lite.requirements-2

scenario / standard / `design-lite.requirements`

A request says build a fast booking service. Ask for concrete requirements before choosing a cache or database, including capacity, latency, booking rules and failure behavior.

Editorial context (draft, not a reviewed rubric): Translate vague speed requirements into measurable workload and response expectations. Clarify uniqueness, cancellation and consistency requirements before optimizing an assumed bottleneck.

## design-lite.service-data-1

system-design-lite / standard / `design-lite.service-data`

Design the API and data relationships for a small event registration service. Prevent duplicate registration by the same user and show how event capacity is enforced under simultaneous requests.

Editorial context (draft, not a reviewed rubric): Use a unique user-event relationship and enforce capacity atomically through a transaction or conditional update. A client-side capacity check alone is insufficient.

## design-lite.service-data-2

system-design-lite / standard / `design-lite.service-data`

Draw a simple task-list service with users, lists and tasks. Explain ownership checks, the create-task data flow and one way to query unfinished tasks efficiently.

Editorial context (draft, not a reviewed rubric): Represent list membership or ownership explicitly and check it on mutations. Use an appropriate indexed filter if justified by the workload, without inventing a distributed architecture.

## design-lite.reliability-1

system-design-lite / stretch / `design-lite.reliability`

A small order service stores orders and queues emails. Explain how it can preserve an order if the email provider is unavailable and how retries can avoid duplicate work.

Editorial context (draft, not a reviewed rubric): Commit order state independently of provider availability and persist dispatch intent, for example with an outbox. Workers use stable identities and bounded retries; delivery guarantees depend on the provider.

## design-lite.reliability-2

scenario / standard / `design-lite.reliability`

A nonessential recommendation service becomes slow. Explain how request timeouts and a fallback can protect a core checkout flow, and name an observability signal.

Editorial context (draft, not a reviewed rubric): Bound the dependency deadline and return a safe fallback without blocking essential checkout state. Track timeout rates and latency; a fallback must not hide failed business writes.

## programming.control-data-1

coding / easy / `programming.control-data`

In Python or JavaScript, write a function returning the sum of positive integers in a list. Do not mutate the input. Include an empty-list case.

Editorial context (draft, not a reviewed rubric): Initialize an accumulator to zero and add only values greater than zero. An empty list produces zero and input mutation is unnecessary.

## programming.control-data-2

coding / standard / `programming.control-data`

In Python or JavaScript, group a list of words by their length and return a map from length to the words in their original relative order. Explain behavior for empty input.

Editorial context (draft, not a reviewed rubric): Append each word to its length bucket while scanning. Preserve insertion order inside each bucket; an empty input produces an empty map.

## programming.debug-test-1

debugging / standard / `programming.debug-test`

A function should return the largest integer in a nonempty list but initializes its maximum to zero. Explain a failing input, fix the initialization and propose regression tests.

Editorial context (draft, not a reviewed rubric): An all-negative list exposes the error. Initialize from the first element or a valid negative-infinity sentinel, and define behavior for empty input rather than assuming zero is valid.

## programming.debug-test-2

coding / standard / `programming.debug-test`

In Python or JavaScript, implement a function that removes consecutive repeated characters from a string, so aaabbcca becomes abca. Give tests for empty input, one character and separated repeats.

Editorial context (draft, not a reviewed rubric): Compare each character to the last emitted character. Only consecutive repeats collapse; later repeated characters separated by other characters must remain.

## programming.error-handling-1

conceptual-oral / easy / `programming.error-handling`

Explain why catching every exception and returning an empty list can hide a failed data fetch. How can a caller distinguish a valid empty result from unavailable data?

Editorial context (draft, not a reviewed rubric): Use an explicit error result or propagate a typed failure. A successful empty collection and a failed operation are different states and should not share indistinguishable outputs.

## programming.error-handling-2

debugging / standard / `programming.error-handling`

An asynchronous function starts a write without awaiting it and immediately reports success. Explain a possible failure and show how to report completion or failure accurately in Python or JavaScript.

Editorial context (draft, not a reviewed rubric): Await the asynchronous operation and handle or propagate its failure. If work is intentionally queued, report accepted or pending rather than falsely claiming the durable write completed.
