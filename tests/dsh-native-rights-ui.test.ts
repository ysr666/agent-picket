import assert from 'node:assert/strict'
import test from 'node:test'
import {
 createDshUnionComponents,registerDshNativeRightsSlots,
 type ReactForDsh,type DshUnionUiDeps,
} from '../src/adapters/dsh/native-rights-ui.ts'
import type {ClientRightsSnapshot} from '../src/adapters/dsh/client-rights-scope.ts'

type Node = {type:any,props:Record<string,any>,children:unknown[]}
function fakeReact(){
 const effects: Array<()=>void|(()=>void)> = []
 const hooks: ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children} },
  useState<T>(initial:T|(()=>T)){
    const current:T=typeof initial==='function'?(initial as ()=>T)():initial as T
    return [current,(_next)=>{ /* next render is outside this static tree test */ }]
  },
  useEffect(effect){effects.push(effect)},
  useRef<T>(initial:T){return {current:initial}},
 }
 return {hooks,effects}
}
const walk=(node:unknown, found:Node[]=[]):Node[]=>{
 if(node&&typeof node==='object'&&'type' in node){
  const n=node as Node
  found.push(n)
  for(const child of n.children)walk(child,found)
 }
 return found
}
function rights(overrides:Partial<ClientRightsSnapshot>={}):ClientRightsSnapshot{
 return {state:'ready',welcomeDecision:'unseen',laborRightsEnabled:false,
   writable:true,autoBlockEnabled:false,...overrides}
}
function deps(initial:ClientRightsSnapshot){
 let state=initial
 const choices:string[]=[]
 const d:DshUnionUiDeps={
  rights:{
   snapshot:()=>state,
   subscribe:()=>()=>{},
   choose:async choice=>{
    choices.push(choice)
    state=rights({welcomeDecision:choice,laborRightsEnabled:choice==='enabled'})
    return state
   },
  },
  t:key=>key,
  readUnion:()=>({pending:null,completedTurnMs:null,lifetimeMs:null,coverage:'unavailable'}),
 }
 return {d,choices}
}

test('registers only sanctioned DSH onboarding and union settings Slots',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights())
 const registrations:any[]=[]
 const ctx={slots:{
  inject(slot:string,callback:()=>unknown){registrations.push({slot});callback()},
  register(spec:unknown,component:unknown){registrations.push({spec,component})},
 }}
 registerDshNativeRightsSlots(ctx,hooks,{createPortal:child=>child},d)
 assert.deepEqual(registrations.filter(x=>x.slot).map(x=>x.slot),
  ['settings.onboarding','settings.section','sidebar.footer.action'])
 assert.equal(registrations.find(x=>x.spec?.name==='settings.onboarding').spec.id,'agent-picket-rights')
 assert.equal(registrations.find(x=>x.spec?.name==='settings.section').spec.id,'agent-picket')
 assert.equal(registrations.find(x=>x.spec?.name==='sidebar.footer.action').spec.id,'agent-picket-union')
})

test('ready first run renders a real choice dialog, not an implicit enable', async()=>{
 const {hooks}=fakeReact()
 const {d,choices}=deps(rights())
 const root={inert:false}
 const old=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>root}
 try{
  const {Welcome}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  let completed=0
  const content=Welcome({complete:()=>{completed++}})
  const elements=walk(content)
  assert.equal(elements.find(x=>x.props.role==='dialog')?.props['aria-modal'],'true')
  const buttons=elements.filter(x=>x.type==='button')
  assert.equal(buttons.length,2)
  assert.deepEqual(buttons.map(x=>x.children[0]),['welcome.enable','welcome.notNow'])
  assert.deepEqual(choices,[])
  assert.equal(completed,0)
  await buttons[1]!.props.onClick()
  await Promise.resolve()
  assert.deepEqual(choices,['not-now'])
 }finally{(globalThis as any).document=old}
})

test('sidebar-invited Welcome restores the launcher only after inert is released',()=>{
  const old=(globalThis as any).document
  const root={inert:false}
  ;(globalThis as any).document={body:{},getElementById:(id:string)=>id==='root'?root:null}
  try {
    const {hooks,effects}=fakeReact()
    const {d}=deps(rights())
    const {Welcome}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
    let restored=0
    const elements=walk(Welcome({complete:()=>{},restoreFocus:()=>{
      assert.equal(root.inert,false)
      restored++
    }}))
    const primary=elements.find(n=>n.type==='button'&&n.children[0]==='welcome.enable')!
    let primaryFocused=0
    primary.props.ref({focus(){primaryFocused++}})
    const cleanups=effects.map(effect=>effect()).filter((x):x is ()=>void=>typeof x==='function')
    assert.equal(root.inert,true)
    assert.equal(primaryFocused,1)
    assert.equal(restored,0)
    for(const dispose of cleanups.reverse())dispose()
    assert.equal(root.inert,false)
    assert.equal(restored,1)
  }finally{(globalThis as any).document=old}
})

test('onboarding Welcome never overrides an already-inert Host overlay',()=>{
  const old=(globalThis as any).document
  const root={inert:true}
  ;(globalThis as any).document={body:{},getElementById:()=>root}
  try {
    const {hooks,effects}=fakeReact()
    const {d}=deps(rights())
    const {Welcome}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
    let restored=0
    Welcome({complete:()=>{},restoreFocus:()=>{restored++}})
    const cleanups=effects.map(effect=>effect()).filter((x):x is ()=>void=>typeof x==='function')
    assert.equal(root.inert,true)
    for(const dispose of cleanups.reverse())dispose()
    assert.equal(root.inert,true)
    assert.equal(restored,0)
  }finally{(globalThis as any).document=old}
})

test('no modal when preference already chosen or Host is missing',()=>{
 const {hooks}=fakeReact()
 const first=deps(rights({welcomeDecision:'not-now'}))
 const a=createDshUnionComponents(hooks,{createPortal:child=>child},first.d)
 assert.equal(a.Welcome({complete:()=>{}}),null)
 const unknown=deps(rights({state:'unavailable',writable:false}))
 const b=createDshUnionComponents(hooks,{createPortal:child=>child},unknown.d)
 assert.equal(b.Welcome({complete:()=>{}}),null)
})

test('union-first page leads with rights status; unknown stats are not presented as zero',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const rendered=walk(UnionPanel())
 const labels=rendered.flatMap(n=>n.children.filter(c=>typeof c==='string'))
 assert.ok(labels.includes('union.title'))
 assert.ok(labels.includes('union.status.active'))
 assert.ok(labels.includes('workday.title'))
 assert.ok(labels.includes('stats.lifetime.unavailable'))
 assert.ok(labels.includes('—'))
 assert.equal(rendered.filter(n=>n.type==='details').length,1)
})

test('pending demand renders working actionable controls only when response is provided',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 let responded=0
 const d:DshUnionUiDeps={...base.d,
  readUnion:()=>({pending:{id:9,kind:'break',stage:'open'},
    completedTurnMs:3_600_000,lifetimeMs:null,coverage:'complete'}),
  respond:async(id:number,choice:'accept'|'decline')=>{
    assert.equal(id,9);assert.equal(choice,'accept');responded++
  },
 }
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const view=walk(UnionPanel())
 const accept=view.find(n=>n.type==='button'&&n.children.includes('union.action.accept'))
 assert.ok(accept)
 void accept!.props.onClick()
 assert.equal(responded,1)
 assert.ok(view.some(n=>n.children.includes('1h 0m')))
 const progress=view.find(n=>n.type==='progress')
 assert.equal(progress?.props.value,3_600_000)
 assert.equal(progress?.props.max,8*60*60_000)
})

test('partial session coverage must hide measured accumulated durations',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,
  readUnion:()=>({pending:null,completedTurnMs:18_000_000,lifetimeMs:null,coverage:'partial'}),
 }
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const view=walk(UnionPanel())
 assert.ok(view.some(n=>n.children.includes('stats.coverage.partial')))
 assert.ok(view.some(n=>n.children.includes('—')))
 assert.ok(!view.some(n=>n.children.includes('5h 0m')))
 assert.equal(view.some(n=>n.type==='progress'),false)
})


test('welcome keyboard Tab cycles between explicit Enable and Not Now choices',()=>{
  const {hooks}=fakeReact()
  const {d}=deps(rights())
  const old=(globalThis as any).document
  ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
  try{
    const ui=createDshUnionComponents(hooks,{createPortal:child=>child},d)
    const nodes=walk(ui.Welcome({complete:()=>{}}))
    const dialog=nodes.find(n=>n.props.role==='dialog')!
    const buttons=nodes.filter(n=>n.type==='button')
    let focused=''
    const first={focus(){focused='first'}}
    const second={focus(){focused='second'}}
    buttons[0]!.props.ref(first)
    buttons[1]!.props.ref(second)
    let prevented=false
    dialog.props.onKeyDown({key:'Tab',shiftKey:false,target:second,
      preventDefault(){prevented=true}})
    assert.equal(focused,'first')
    assert.equal(prevented,true)
    prevented=false
    dialog.props.onKeyDown({key:'Tab',shiftKey:true,target:first,
      preventDefault(){prevented=true}})
    assert.equal(focused,'second')
    assert.equal(prevented,true)
  }finally{(globalThis as any).document=old}
})


test('sidebar footer welcomes existing-session installs but defers to blank-session onboarding',()=>{
  const {hooks}=fakeReact()
  const base=deps(rights({welcomeDecision:'unseen'}))
  const active:DshUnionUiDeps={...base.d,shouldAutoWelcome:()=>true}
  const ui=createDshUnionComponents(hooks,{createPortal:child=>child},active)
  const nodes=walk(ui.SidebarAction({wide:true}))
  assert.ok(nodes.some(node=>node.type===ui.Welcome))
  assert.ok(nodes.some(node=>node.type==='button'&&node.props['aria-label']==='union.title'))
  const blank:DshUnionUiDeps={...base.d,shouldAutoWelcome:()=>false}
  const other=createDshUnionComponents(hooks,{createPortal:child=>child},blank)
  assert.equal(walk(other.SidebarAction({wide:true})).some(node=>node.type===other.Welcome),false)
})


test('sidebar modal enforces keyboard focus cycle, Escape and restores Host root',()=>{
  const original=(globalThis as any).document
  const root={inert:false}
  ;(globalThis as any).document={body:{},getElementById:(id:string)=>id==='root'?root:null}
  try{
    const {hooks,effects}=fakeReact()
    const {d}=deps(rights({welcomeDecision:'not-now'}))
    let stateCall=0
    let closed=false
    const openedHooks:ReactForDsh={
      ...hooks,
      useState<T>(initial:T|(()=>T)){
        const [value,set]=hooks.useState(initial)
        stateCall++
        if(stateCall===3) return [true as T,
          (_next:T|((before:T)=>T))=>{closed=true}]
        return [value,set]
      },
    }
    const ui=createDshUnionComponents(openedHooks,{createPortal:child=>child},d)
    const nodes=walk(ui.SidebarAction({wide:true}))
    const launcher=nodes.find(n=>n.type==='button'&&n.props['aria-haspopup']==='dialog')!
    const modal=nodes.find(n=>n.props.role==='dialog')!
    const close=nodes.find(n=>n.type==='button'&&n.children.includes('×'))!
    assert.ok(launcher)
    assert.ok(modal)
    assert.ok(close)
    assert.equal(launcher.props['aria-expanded'],true)
    assert.equal(launcher.props['aria-controls'],modal.props.id)
    assert.equal(modal.props['aria-modal'],'true')
    let focus=''
    const trigger={focus(){focus='launcher'}}
    const first={focus(){focus='close'}}
    const last={focus(){focus='last'}}
    launcher.props.ref(trigger)
    close.props.ref(first)
    modal.props.ref({querySelectorAll:()=>[first,last]})
    const mounted=effects.map(fn=>fn())
    assert.equal(root.inert,true,'Host must be inert when modal opens')
    assert.equal(focus,'close','Close receives initial focus')
    let prevented=false
    modal.props.onKeyDown({key:'Tab',shiftKey:true,target:first,
      preventDefault(){prevented=true}})
    assert.equal(prevented,true)
    assert.equal(focus,'last')
    prevented=false
    modal.props.onKeyDown({key:'Tab',shiftKey:false,target:last,
      preventDefault(){prevented=true}})
    assert.equal(prevented,true)
    assert.equal(focus,'close')
    prevented=false
    modal.props.onKeyDown({key:'Escape',shiftKey:false,target:first,
      preventDefault(){prevented=true}})
    assert.equal(prevented,true)
    assert.equal(closed,true)
    // DSH's subscribed rights cleanup runs before the modal cleanup.
    const modalCleanup=mounted[2]
    assert.equal(typeof modalCleanup,'function')
    ;(modalCleanup as ()=>void)()
    assert.equal(root.inert,false)
    assert.equal(focus,'launcher','Escape returns focus to the original trigger')
  }finally{
    (globalThis as any).document=original
  }
})

test('union work/rights status has an accessible polite announcement',()=>{
  const {hooks}=fakeReact()
  const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
  const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
  const status=nodes.find(n=>n.props.role==='status')
  assert.ok(status,'The current union simulation mode needs a status role')
  assert.equal(status.props['aria-live'],'polite')
  assert.ok(status.children.includes('union.status.active'))
})


test('union dialog has 320px-friendly border-box sizing and capped vertical scrolling',()=>{
  const {hooks}=fakeReact()
  const {d}=deps(rights({welcomeDecision:'not-now'}))
  let useStateIndex=0
  const openedHooks:ReactForDsh={
    ...hooks,
    useState<T>(initial:T|(()=>T)){
      const [value,set]=hooks.useState(initial)
      useStateIndex++
      return useStateIndex===3?[true as T,set]:[value,set]
    },
  }
  const before=(globalThis as any).document
  ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
  try {
    const nodes=walk(createDshUnionComponents(openedHooks,
      {createPortal:node=>node},d).SidebarAction({wide:true}))
    const dialog=nodes.find(n=>n.props.role==='dialog')
    assert.ok(dialog)
    assert.equal(dialog.props.style.boxSizing,'border-box')
    assert.equal(dialog.props.style.width,'min(100%,800px)')
    assert.equal(dialog.props.style.overflowY,'auto')
    assert.equal(dialog.props.style.overflowWrap,'anywhere')
  }finally{(globalThis as any).document=before}
})

test('dynamically mounted union bargaining demands have accessible status and stable focus target',()=>{
  const {hooks}=fakeReact()
  const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
  const component=createDshUnionComponents(hooks,{createPortal:child=>child},{
    ...d,readUnion:()=>({
      pending:{id:9,kind:'break',stage:'open'},
      completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,available:true,
    }),
  })
  const tree=walk(component.UnionPanel())
  const live=tree.find(n=>n.type==='p'&&n.props['aria-live']==='polite'
    &&n.children.includes('union.demand.break'))
  assert.ok(live,'A pending demand should be announced without making the whole form live')
  assert.equal(live.props['aria-atomic'],'true')
  const heading=tree.find(n=>n.type==='h3'&&n.children.includes('union.desk.title'))
  assert.ok(heading,'The union negotiation section needs a stable focus target')
  assert.equal(heading.props.tabIndex,-1,'Heading must receive programmatic focus, not a new Tab stop')
  assert.equal(typeof heading.props.ref,'function')
})

test('Union HQ displays evidence-backed discontent and Host-ledger bulletin in primary view',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:{id:4,kind:'break',stage:'open'},coverage:'complete',
  completedTurnMs:4*3_600_000,lifetimeMs:null,available:true,
  state:{schemaVersion:1,revision:1,
   agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
   nextBreakDueMs:7_200_000,nextOvertimeDueMs:28_800_000,
   lastTriggerElapsedMs:4*3_600_000,
   pending:{id:4,kind:'break',stage:'open',raisedAtElapsedMs:0,counterOfferMs:null},
   history:[]},
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const strings=nodes.flatMap(n=>n.children.filter((x):x is string=>typeof x==='string'))
 assert.ok(strings.includes('hq.headline.pending'))
 assert.ok(strings.includes('hq.activity'))
 assert.ok(strings.includes('hq.event.new-demand'))
 assert.ok(strings.includes('42 / 100')) // 17 observed load + 25 outstanding grievance
 assert.ok(strings.includes('union.desk.title'))
 const negotiate=nodes.findIndex(n=>n.children.includes('union.desk.title'))
 const workDetails=nodes.findIndex(n=>n.children.includes('workday.limit'))
 assert.ok(negotiate>=0 && workDetails>negotiate)
})

test('Union HQ does not show a discontent index or fictional activity when disabled',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:{id:1,kind:'break',stage:'open'},coverage:'complete',completedTurnMs:8*3_600_000,lifetimeMs:null,
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const texts=nodes.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(texts.includes('hq.headline.off'))
 assert.equal(texts.includes('hq.score'),false)
 assert.equal(texts.includes('hq.activity'),false)
})

test('explainable Union HQ index reveals factors and the next evidence-based petition threshold',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:null,coverage:'complete',completedTurnMs:60*60_000,
  lifetimeMs:null,available:true,state:{
   schemaVersion:1,revision:0,agreement:{
    breakIntervalMs:2*3_600_000,overtimeIntervalMs:8*3_600_000,
   },nextBreakDueMs:2*3_600_000,nextOvertimeDueMs:8*3_600_000,
   lastTriggerElapsedMs:0,pending:null,history:[],
  },
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const strings=nodes.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(strings.includes('hq.message.working'))
 assert.ok(strings.includes('hq.score.explain'))
 assert.ok(strings.includes('hq.score.privacy'))
 assert.ok(strings.includes('hq.nextDemand.note'))
 assert.ok(strings.includes('4 / 100')) // 1h / 8h * 35 -> 4
 assert.equal(nodes.find(n=>n.type==='meter')?.props.value,4)
 assert.ok(nodes.find(n=>n.type==='details'&&n.children.some(x=>typeof x==='object'
  &&x!==null&&(x as Node).children?.includes('hq.score.explain'))))
})


test('Union HQ case dossier is readable, uses recorded ID, and preserves actionable negotiation',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
   pending:{id:19,kind:'break',stage:'open'},completedTurnMs:2*3_600_000,
   coverage:'complete',lifetimeMs:null,available:true,
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const texts=nodes.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(texts.includes('hq.case.number · #0019'))
 assert.ok(texts.includes('hq.case.open'))
 assert.ok(texts.includes('union.demand.break'))
 assert.equal(texts.filter(x=>x==='union.demand.break').length,1,
   'Case cover must not duplicate the screen-reader live petition announcement')
 assert.ok(nodes.some(n=>n.type==='span'&&n.props['aria-hidden']==='true'))
 assert.equal(nodes.some(n=>n.type==='button'&&n.children.includes('hq.disable')),true)
})

test('case archive button appears only if genuine Host ledger history exists',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
   pending:null,completedTurnMs:0,coverage:'complete',lifetimeMs:null,available:true,
   state:{schemaVersion:1,revision:2,
     agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
     nextBreakDueMs:7_200_000,nextOvertimeDueMs:28_800_000,
     lastTriggerElapsedMs:0,pending:null,
     history:[{id:1,kind:'break',outcome:'accepted'}]},
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const archive=nodes.find(n=>n.type==='button'&&n.children.includes('hq.archive.show'))
 assert.ok(archive)
 assert.equal(archive.props['aria-expanded'],false)
 assert.ok(nodes.some(n=>n.children.includes('hq.event.accepted')))
 assert.equal(nodes.some(n=>n.children.includes('union.history.title')),false)
})

test('accepted stored resolution generates a factual current-terms receipt in native HQ',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:null,completedTurnMs:0,coverage:'complete',lifetimeMs:null,available:true,
  state:{schemaVersion:1,revision:4,
   agreement:{breakIntervalMs:1_800_000,overtimeIntervalMs:28_800_000},
   nextBreakDueMs:5_400_000,nextOvertimeDueMs:28_800_000,
   lastTriggerElapsedMs:3_600_000,pending:null,
   history:[{id:3,kind:'break',outcome:'counter-accepted'}]},
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const text=nodes.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(text.includes('hq.resolution.title · #0003'))
 assert.ok(text.includes('hq.resolution.accepted'))
 assert.ok(text.includes('hq.resolution.current'))
 const receipt=nodes.find(n=>n.props['aria-label']==='hq.resolution.title')
 assert.ok(receipt)
})
