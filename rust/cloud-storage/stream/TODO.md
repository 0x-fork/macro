This is the 1st pass of the stream crate. This is the realization of the 
design outlined in @DESIGN.md

This is the 1st iteration and we're going to focus on testability and validating the 
design before moving on to a more robust implementation. This means that this 
implementation should use an in-memory store instead of redis. We can integrate with
a ws server and DCS using this implementation to validate that this works.

Don't integrate anything yet but do implement the design in DESIGN.md using an in-memory
store instead of redis. The in-memory store should focus on being
obviously correct. I don't care about performance at all. It should be readable
by someone with limited rust knowledge
