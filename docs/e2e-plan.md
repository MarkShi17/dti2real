# Expanded end-to-end verification

1. [ ] Add reusable browser fixtures, console-error guards and browser matrix.
2. [ ] Cover UI workflows, failure recovery, async races and session lifecycle.
3. [ ] Cover real HTTP API validation, isolation, rate limits and exports.
4. [ ] Exercise live adapters through the production server with external-service fixtures; block paid/network calls.
5. [ ] Run isolated Docker tests, fix reproduced defects, rebuild and document actual results and remaining uncertainty.

The existing user demo stays on 3212. Test data lives only in disposable test containers. Production code must not import test mocks. Tests assert outcomes and request semantics, not just button clicks or screenshots. External model accuracy, inventory availability and CUDA execution remain outside a credential-free test.
