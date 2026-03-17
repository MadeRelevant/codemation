* [x] use tsyringe instead of cheap createSimpleContainer()
* [x] tighten typings and generics so consumers and library/core nodes allways get actual properties based on node input/output schemas which can be tight 100% when don correctly from the start
* [x] let the frontend handle all the heavy lifting of spinning up the UI, http server etc but allow consumers to hook into this so they can provide custom routes easily
* [ ] move core/src/ai.ts to core-nodes/ai-agent
* [x] split workflow setup into separate service instead of within engine
* [x] remove the service locator behaviour from the context factory, either set those at the factory or let classes just inject the required services
* [ ] add infinite recursion protection
* [ ] add tests what happens when aggregating items or vice versa (splitting items) and check paired items dont get messed up
* [ ] deal with binary data
* [ ] build webhook node
    * [ ] add oauth flows for credentials
* [ ] allow array of nodes in then() for parallelism
* [x] store a snapshot of the config at each run and build the canvas from that snapshot for historical views
* [x] split RunRouteHandler
* [x] Fix naming for PersistedWorkflow*
* [ ] Fix icon resolver, currently its using hardcoded map/if
* [ ] Fix datetime formatting, use battle tested library instead
* [ ] Allow binary uploads to webhook nodes
