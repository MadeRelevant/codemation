* [ ] use tsyringe instead of cheap createSimpleContainer()
* [ ] tighten typings and generics so consumers and library/core nodes allways get actual properties based on node input/output schemas which can be tight 100% when don correctly from the start
* [ ] let the frontend handle all the heavy lifting of spinning up the UI, http server etc but allow consumers to hook into this so they can provide custom routes easily
* [ ] move core/src/ai.ts to core-nodes/ai-agent
* [ ] split workflow setup into separate service instead of within engine
* [ ] remove the service locator behaviour from the context factory, either set those at the factory or let classes just inject the required services
* [ ] add infinite recursion protection
* [ ] add tests what happens when aggregating items or vice versa (splitting items) and check paired items dont get messed up