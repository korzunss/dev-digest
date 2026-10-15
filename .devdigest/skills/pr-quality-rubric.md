# PR quality rubric

Weigh a change on these, in order. An earlier item outranks a later one.

1. **Blast radius** — how many callers, tenants, or stored rows does this touch
   if it is wrong? A defect on a shared path outranks a worse defect on a leaf.
2. **Reversibility** — can this be rolled back cleanly? A data migration and a
   changed on-the-wire contract cannot; a pure code change can.
3. **Detectability** — would anything fail if this were wrong? A silent wrong
   answer is worse than a crash.
4. **Locality** — is the change explicable from the diff alone, or does it rely
   on invariants held somewhere the reviewer cannot see?

Style, naming and formatting are below all four. Do not lead with them.
