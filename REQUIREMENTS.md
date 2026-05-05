# MCP Client
Macro AI supports MCP server using RMCP and the tools infrastructure. 

Users want an MCP client. This is a more involved change. 

As an MCP client users will expect:
  - Macro AI to connect and integrate with _any_ mcp server
  - UI to connect and manage MCP servers
  - Correct and easy connection to new servers including OAuth flow
  - Persistent configuration across all devices including authentication
  - UI to indicate external MCP usage
  - MCP usage from background or scheduled AI tasks

# Technical Overview

A lool loop looks something like this

1. User request (model + messages)
2. Send request to provider
3. Did user request tool calls?
  - Yes 
    - call tools
    - update request with agent response (including tool calls)
    - update request with tool call responses
    - loop
  - No
    - Done

An MCP tool loop is very similar except:
- Tools may not be called on our server they may have to be routed to the MCP
- There may be an active toolset and a set of servers that may provide tools
  if the assistant selects them.
(I think these are both part of the context passed into a single request and outside the scope of the tool loop)
- MCP prompts? 
- MCP resources?
- Tools need to be generically configurable 

This is slightly complicated by `UserContext` which includes
information that allows AI to act on behalf of the current user.

And, `ServiceContext` which includes the context necessary to execute
or dispatch tools. This likely also needs to include a user config
telling AI which tools it's allowed to automatically execute and which
tools require user confirmation.

# Plan
Start with functionality move to UI and features. 
1. Support short-lived MCP connection on the backend 
2. Support for stored credentials 
3. Support for managing MCP servers
4. UI
5. OAuth

# V0 Functionality

Making this work at all is a significant challenge.
The current tool loop infrastructure lives in the AI crate. 

It may make sense to deal with tool routing 1st as this is
one of the largest parts of MCP client.

## Tool Routing
Name conflicts among toolsets will cause 400 requests and
is something that can be handled with name mangling and a 
demangling router. 

Q: Is there a standard way to handle this?
Q: How do we know what toolset / which server to route a 
tool-call too? 
  - Name mangling routing solves this but is this the only way?

## Connection
The tool loop will accept some set of connection details and credential
to talk to external servers. 

The MCP connection protocol will give the client some stuff which then
we'll use to build requests to our ai provider.

Q: What does the MCP protocol give the client? tool schemas? prompts?
Q: What is a connection? how long does it last? How do we manage it?

A: The current tool-loop is a turn-based tool-loop and is designed for idempotency.
This means that it takes in a chat state and does the agent turn which may be many
trips to/from the server then returns a new chat state. The addition of an 
mcp server complicates this because the connection needs to persist beyond the agent's
turn. Furthermore, there's not a clear way to terminate connections. It's not
clear when a user stops interacting with a chat. It may be possibble to just
reconnect on every user message, but this overhead may not be acceptable.


# Changes and Integration
The current AI infrastructure is messy and hasy some hacky / poorly written abstractions 
for historical reasons. These include the "extended ai provider" created to support
server-side tools. This also includes the openai roundtrip message conversion happening
for all messages even though we're only using anthropic.

Creating a tool loop that supports mcp servers is such a large overhaul that it's
likely worth it to cleanup these idiosyncrasies.
