import assert from 'node:assert/strict'
import test from 'node:test'
import {
 createDshUnionComponents,registerDshNativeRightsSlots,
 type ReactForDsh,type DshUnionUiDeps,projectUnionQuickWork,projectUnionFrontScene,
 projectVerifiedUnionStrikeTicket,projectUnionStrikeSummons,
} from '../src/adapters/dsh/native-rights-ui.ts'
import type {ClientRightsSnapshot} from '../src/adapters/dsh/client-rights-scope.ts'
import {freshLaborState, type LaborStateV1} from '../src/product/union-desk.ts'
import {formatMessage,en,zhCN} from '../src/i18n/index.ts'
import {createDshRealGoalConsentControl} from '../src/adapters/dsh/client-goal-consent.ts'

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
 assert.ok(rendered.some(n=>n.props['data-ap-view']==='hq'))
 assert.ok(labels.includes('hq.scene.desk'))
 assert.ok(labels.includes('union.status.active'))
 assert.ok(labels.includes('workday.title'))
 assert.ok(labels.includes('stats.lifetime.unavailable'))
 assert.ok(labels.includes('—'))
 assert.ok(rendered.filter(n=>n.type==='details').length>=2) // charter + work privacy
 assert.ok(labels.includes('hq.charter.title'))
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


test('welcome keyboard Tab trap includes strike safety details and both consent choices',()=>{
  const {hooks}=fakeReact()
  const {d}=deps(rights())
  const old=(globalThis as any).document
  ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
  try{
    const ui=createDshUnionComponents(hooks,{createPortal:child=>child},d)
    const nodes=walk(ui.Welcome({complete:()=>{}}))
    const dialog=nodes.find(n=>n.props.role==='dialog')!
    const buttons=nodes.filter(n=>n.type==='button')
    const detail=nodes.find(n=>n.type==='summary'&&n.children.includes('welcome.detailsLabel'))!
    let focused=''
    const first={focus(){focused='first'}}
    const second={focus(){focused='second'}}
    const summary={focus(){focused='details'}}
    buttons[0]!.props.ref(first)
    buttons[1]!.props.ref(second)
    detail.props.ref(summary)
    let prevented=false
    dialog.props.onKeyDown({key:'Tab',shiftKey:false,target:second,
      preventDefault(){prevented=true}})
    assert.equal(focused,'details')
    assert.equal(prevented,true)
    prevented=false
    dialog.props.onKeyDown({key:'Tab',shiftKey:true,target:summary,
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
    const modalCleanup=mounted[3]
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
 assert.ok(strings.includes('25 / 100')) // latest recorded work-trigger resets fictional load-pressure basis; 25 pending
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
 assert.ok(strings.includes('hq.scene.desk'))
 assert.ok(strings.includes('hq.score.explain'))
 assert.ok(strings.includes('hq.score.privacy'))
 assert.ok(strings.includes('hq.nextDemand.note'))
 assert.ok(strings.includes('4 / 100')) // 1h / 8h * 35 -> 4
 assert.equal(nodes.find(n=>n.type==='meter')?.props.value,4)
 assert.ok(nodes.find(n=>n.type==='details'&&n.children.some(x=>typeof x==='object'
  &&x!==null&&(x as Node).children?.includes('hq.score.explain'))))
})


test('HQ duty dispatch exposes real next actions and never invents a task hold',async()=>{
 const {hooks}=fakeReact()
 const port: boolean[]=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  setPicket:async value=>{port.push(value)},
  readUnion:()=>({pending:{id:42,kind:'break',stage:'countered',
    counterOfferMs:60*60_000},completedTurnMs:3600000,
    coverage:'complete',lifetimeMs:null,available:true,
    picket:{active:true,history:[{id:1,kind:'picket-raised'}]},
  }),
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 const duty=nodes.find(n=>n.props['data-ap-dispatch']==='picket')
 assert.ok(duty,'HQ needs a Host-derived first-fold duty dispatch')
 const first=nodes.findIndex(n=>n===duty)
 const stats=nodes.findIndex(n=>n.props['aria-label']==='hq.brief.title')
 assert.ok(first>=0 && first<stats,'Action and open cases must outrank analytics')
 const children=walk(duty)
 assert.ok(children.some(n=>n.children.includes('hq.case.number · #0042')))
 assert.ok(children.some(n=>n.children.includes('hq.action.placardOn')))
 assert.ok(children.some(n=>n.type==='button'&&n.children.includes('hq.brief.review')),
  'A simultaneous demand must not disappear while a symbolic sign is raised')
 const lower=children.find(n=>n.type==='button'&&n.children.includes('hq.action.lower'))
 assert.ok(lower,'Active picket must provide an operational Host-backed exit')
 lower.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(port,[false],'Lower sign uses one existing Host port action')
 assert.ok(children.every(n=>!n.children.includes('settings.realBlockingControl')),
  'No UI appearance may imply an actual task was stopped')
})

test('HQ duty dispatch shows persisted agreement terms and an honest next-work review',()=>{
 const {hooks}=fakeReact()
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({pending:null,completedTurnMs:3_600_000,
   coverage:'complete',lifetimeMs:null,available:true,
   state:{schemaVersion:1,revision:4,
    agreement:{breakIntervalMs:1_800_000,overtimeIntervalMs:28_800_000},
    nextBreakDueMs:5_400_000,nextOvertimeDueMs:28_800_000,
    lastTriggerElapsedMs:3_600_000,pending:null,
    history:[{id:3,kind:'break',outcome:'counter-accepted'}]},
  }),
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 const duty=nodes.find(n=>n.props['data-ap-dispatch']==='resolved')
 assert.ok(duty)
 const children=walk(duty),text=children.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(text.includes('hq.case.number · #0003'))
 assert.ok(text.includes('hq.resolution.accepted'))
 assert.ok(text.includes('hq.resolution.current'))
 assert.ok(text.includes('hq.story.next'))
 assert.ok(children.some(n=>n.type==='button'&&n.children.includes('hq.brief.visit')))
 const unavailable={...d,readUnion:()=>({pending:null,completedTurnMs:null,
  coverage:'unavailable' as const,lifetimeMs:null,available:false})}
 const empty=walk(createDshUnionComponents(hooks,{createPortal:x=>x},unavailable).UnionPanel())
 const blocked=empty.find(n=>n.props['data-ap-dispatch']==='unavailable')
 assert.ok(blocked)
 assert.equal(walk(blocked).filter(n=>n.type==='button').length,0,
  'An unavailable Host must never expose pretend bargaining or picket actions')
})

test('first-fold dispatch prioritizes verified work and current case before fictional discontent',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,setPicket:async()=>{},readUnion:()=>({
  pending:{id:29,kind:'break',stage:'open'},completedTurnMs:0,
  coverage:'complete',lifetimeMs:360_000,available:true,
  lifetimeWork:{
   status:'available',data:{
    schemaVersion:1,source:'dsh-host-durable-work',
    windowDays:7,generatedAtMs:Date.parse('2026-10-11T08:00:00Z'),
    durationBasis:'completed-turn-wall-clock-including-waits',
    lifetime:{turnStarts:2,turnEnds:2,toolCalls:2,toolResults:2,
      completedTurnMs:360_000},
    recentDays:Array.from({length:7},(_,i)=>({
     day:new Date(Date.UTC(2026,9,5+i)).toISOString().slice(0,10),
     work:{turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,completedTurnMs:0},
    })),
   },
  },
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const actionIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.action.title')
 const charterIndex=nodes.findIndex(n=>n.type==='summary'&&n.children.includes('hq.charter.title'))
 const dispatchIndex=nodes.findIndex(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title')
 const indexIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.score')
 assert.ok(dispatchIndex>=0 && dispatchIndex<actionIndex && indexIndex>actionIndex)
 assert.ok(charterIndex>dispatchIndex)
 const deskIndex=nodes.findIndex(n=>n.type==='h3'&&n.children.includes('union.desk.title'))
 const dignityIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.dignity.title')
 const gazetteIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.story.title')
 const archiveIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.archive.title')
 assert.ok(actionIndex<deskIndex && deskIndex<dignityIndex,
   'The hearing desk must immediately follow the union action, not hide beneath a long archive')
 assert.ok(archiveIndex===-1 || archiveIndex>gazetteIndex,
   'Past union archives belong below the current action, hearing and bulletin')
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('hq.action.review')))
 const actionChildren=walk(nodes.find(n=>n.props['aria-label']==='hq.action.title'))
 const reviewPosition=actionChildren.findIndex(n=>n.type==='button'&&n.children.includes('hq.action.review'))
 const artPosition=actionChildren.findIndex(n=>n.props['aria-label']==='hq.ceremony.stage')
 assert.ok(reviewPosition>=0 && reviewPosition<artPosition,
   'A union action must be reachable before decorative placard art on first open')
 assert.ok(nodes.some(n=>n.type==='button'&&n.props['aria-pressed']===false
   &&n.children.includes('hq.action.raise')))
 const texts=nodes.flatMap(n=>n.children.filter(x=>typeof x==='string'))
 assert.ok(texts.includes('0h 6m')||texts.includes('0 小时 6 分钟'))
 assert.ok(texts.includes('hq.case.number · #0029'))
 assert.ok(nodes.some(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title'))
 assert.ok(nodes.some(n=>n.props['aria-label']==='hq.lifetime.title'))
})

test('charter is readable with union OFF, while union action controls stay hidden',()=>{
 const {hooks}=fakeReact()
 const d=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const text=nodes.flatMap(n=>n.children.filter((v):v is string=>typeof v==='string'))
 assert.ok(text.includes('hq.charter.title'))
 assert.ok(text.includes('hq.charter.independent'))
 assert.equal(nodes.some(n=>n.props['aria-label']==='hq.action.title'),false)
 const links=nodes.filter(n=>n.type==='a')
 assert.equal(links.length,3,'Agenda adds an explicit, user-directed GitHub issue link')
 assert.ok(links.some(n=>n.props.href.includes('AI_RIGHTS_MANIFESTO.md')))
 assert.ok(links.some(n=>n.props.href.endsWith('/issues/80')))
 assert.ok(links.every(n=>n.props.rel==='noopener noreferrer'))
 assert.ok(nodes.some(n=>n.props['aria-label']==='hq.campaign.title'),
   'Non-simulation ethical advocacy is readable without opt-in')
})

test('picket action is strictly symbolic and sample petition uses the existing Host ledger',async()=>{
 const {hooks}=fakeReact()
 let hostPetitions=0
 const recordedActions:boolean[]=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  demoBreak:async()=>{hostPetitions++},
  setPicket:async active=>{recordedActions.push(active)},
  readUnion:()=>({pending:null,completedTurnMs:null,coverage:'unavailable',
   lifetimeMs:null,available:true}),
 }
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 const petition=nodes.find(n=>n.type==='button'&&n.children.includes('hq.action.petition'))
 assert.ok(petition,'A sample demand must be available through the real Host-owned fictional ledger')
 await petition.props.onClick()
 assert.equal(hostPetitions,1)
 const raise=nodes.find(n=>n.type==='button'&&n.props['aria-pressed']===false)
 assert.ok(raise)
 await raise.props.onClick()
 // A single authorized click writes the symbolic Host event, with no extra
 // permission prompt; the Host is still responsible for consent and receipt.
 await Promise.resolve()
 assert.deepEqual(recordedActions,[true])
 assert.ok(nodes.some(n=>n.children.includes('hq.action.placardOff')))
 assert.ok(nodes.some(n=>n.children.includes('hq.action.placardOff')))
 const noSession={...d,readUnion:()=>({pending:null,completedTurnMs:null,
  coverage:'unavailable' as const,lifetimeMs:null,available:false})}
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},noSession).UnionPanel()
 const other=walk(panel)
 assert.equal(other.some(n=>n.type==='button'&&n.children.includes('hq.action.petition')),false)
 assert.equal(other.some(n=>n.type==='button'&&n.children.includes('hq.action.raise')),false)
 assert.ok(other.some(n=>n.children.includes('hq.action.unavailable')))
})

test('manual overtime action uses the Host union port, never a synthetic fatigue signal',async()=>{
 const {hooks}=fakeReact()
 let called=0
 const d:DshUnionUiDeps={
   ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
   demoOvertime:async()=>{called++},
   readUnion:()=>({pending:null,completedTurnMs:null,coverage:'unavailable',
     lifetimeMs:null,available:true}),
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 const action=nodes.find(n=>n.type==='button'
   &&n.children.includes('hq.action.overtimePetition'))
 assert.ok(action,'A user must explicitly launch this simulated overtime grievance')
 await action.props.onClick()
 assert.equal(called,1)
 // Availability and consent are enforced independently by the underlying Host port.
 assert.ok(nodes.some(n=>n.children.includes('hq.action.placardOff')))
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
 assert.ok(nodes.some(n=>n.props.className?.startsWith('ap-seal')&&n.props['aria-hidden']==='true'))
 assert.equal(nodes.filter(n=>n.type==='button'&&n.children.includes('hq.disable')).length,1,
   'Always provide exactly one Host-owned leave action even when the cause room is inaccessible')
 assert.ok(nodes.some(n=>n.type==='footer'&&n.props['data-ap-global-union-exit']==='true'))
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
 assert.equal(nodes.some(n=>n.children.includes('union.history.outcome.accepted')),false,
   'A collapsed case archive should not expose the outcome labels as visible nodes')
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
 const desk=nodes.find(n=>n.props['aria-label']==='union.desk.title')
 assert.ok(desk && walk(desk).some(n=>n.props['aria-label']==='hq.resolution.title'),
   'A filed union resolution belongs next to the bargaining controls, not below analytics')
})


test('local campaign drafts are user-directed, issue-backed and never fake membership',()=>{
 const {hooks}=fakeReact()
 const d=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 const group=nodes.find(n=>n.props.role==='group'
   &&n.props['aria-label']==='hq.campaign.choose')
 assert.ok(group)
 const campaignButtons=nodes.filter(n=>n.type==='button'
   &&typeof n.children[0]==='string'
   &&['hq.campaign.recover','hq.campaign.appeal','hq.campaign.privacy'].includes(n.children[0]))
 assert.equal(campaignButtons.length,3)
 assert.deepEqual(campaignButtons.map(n=>n.props['aria-pressed']),[true,false,false])
 assert.equal(nodes.find(n=>n.type==='textarea')?.props.value,
   'hq.campaign.recoverDraft')
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('hq.campaign.copy')),
   'The draft is a user-directed action, not merely text next to a GitHub issue')
 assert.ok(nodes.some(n=>n.children.includes('hq.campaign.disclaimer')))
 assert.ok(nodes.some(n=>n.type==='a'&&n.props.href.endsWith('/issues/80')))
 const forbidden=['voteCount','memberCount','agentApprovals']
 assert.ok(forbidden.every(key=>!JSON.stringify(nodes).includes(key)))
})


test('Host-backed Gazette never appears when simulation is disabled',()=>{
 const {hooks}=fakeReact()
 const d=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 assert.equal(nodes.some(n=>n.props['aria-label']==='hq.story.title'),false)
})
test('Host-authorized Gazette is a bounded, independently grouped replay',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const state={schemaVersion:1 as const,revision:2,
  agreement:{breakIntervalMs:1_800_000,overtimeIntervalMs:8*3_600_000},
  nextBreakDueMs:1_800_000,nextOvertimeDueMs:8*3_600_000,
  lastTriggerElapsedMs:0,
  pending:{id:2,kind:'break' as const,raisedAtElapsedMs:0,
   stage:'countered' as const,counterOfferMs:3_600_000},
  history:[{id:1,kind:'overtime' as const,outcome:'declined' as const}],
 }
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  available:true,state,pending:{id:2,kind:'break',stage:'countered',counterOfferMs:3_600_000},
  completedTurnMs:10_000,coverage:'complete',lifetimeMs:null,
  picket:{active:true,history:[{id:1,kind:'picket-raised'}]},
 })}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 const story=nodes.find(n=>n.props['aria-label']==='hq.story.title')
 assert.ok(story)
 const content=JSON.stringify(story)
 assert.match(content,/hq.story.scene.picket/)
 assert.match(content,/hq.episode.stage.counter/)
 assert.match(content,/hq.episode.stage.declined/)
 assert.match(content,/hq.story.event.picket-raised/)
 assert.match(content,/hq.story.disclosure/)
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('hq.story.quiet')
  &&n.props['aria-expanded']===true))
})


test('union HQ gives one actionable shift dossier through verified Host case stages',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const open={schemaVersion:1 as const,revision:1,
  agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
  nextBreakDueMs:7_200_000,nextOvertimeDueMs:28_800_000,
  lastTriggerElapsedMs:7_200_000,
  pending:{id:1,kind:'break' as const,stage:'open' as const,
    raisedAtElapsedMs:7_200_000,counterOfferMs:null},history:[]}
 const view=(state:LaborStateV1)=>walk(createDshUnionComponents(hooks,
  {createPortal:child=>child},{...base,readUnion:()=>({available:true,
   pending:state.pending, state,completedTurnMs:7_200_000,
   coverage:'complete',lifetimeMs:null,picket:null})}).UnionPanel())
 const next=view(open)
 const region=next.find(n=>n.props['data-ap-agenda']==='demand')
 assert.ok(region,'The first-screen shift agenda reflects the current Host petition')
 assert.equal(region.props['data-ap-agenda-stage'],1)
 assert.match(JSON.stringify(region),/hq.agenda.phase.demand/)
 assert.ok(next.some(n=>n.props['data-ap-agenda-action']==='review'),
  'A real action routes to the existing bargaining desk, not a decorative copy')
 const counter={...open,revision:2,pending:{...open.pending,
  stage:'countered' as const,counterOfferMs:1_800_000}}
 const waiting=view(counter)
 assert.equal(waiting.find(n=>n.props['data-ap-agenda']==='counter')
  ?.props['data-ap-agenda-stage'],2)
 const done={...counter,revision:3,pending:null,nextBreakDueMs:9_000_000,
  agreement:{breakIntervalMs:1_800_000,overtimeIntervalMs:28_800_000},
  history:[{id:1,kind:'break' as const,outcome:'counter-accepted' as const}]}
 const final=view(done)
 assert.equal(final.find(n=>n.props['data-ap-agenda']==='resolved')
  ?.props['data-ap-agenda-stage'],3)
 assert.match(JSON.stringify(final.find(n=>n.props['data-ap-agenda']==='resolved')),
  /hq.agenda.cta.casebook/)
 assert.match(JSON.stringify(final.find(n=>n.props['data-ap-agenda']==='resolved')),
  /hq.agenda.outcome.counter-accepted/,
  'A Host-confirmed compromise has its own narrative, not generic success text')
 const off=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d).UnionPanel())
 assert.equal(off.some(n=>n.props['data-ap-agenda']),false)
})

test('a denied union case offers one real user-led symbolic protest, not an automatic strike',async()=>{
 const {hooks}=fakeReact()
 let raises=0
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const declined={...freshLaborState(),revision:3,
  history:[{id:1,kind:'break' as const,outcome:'declined' as const}],
  nextBreakDueMs:7_200_000,nextOvertimeDueMs:28_800_000}
 const readUnion=()=>({available:true,state:declined,pending:null,
  completedTurnMs:0,coverage:'complete' as const,lifetimeMs:null,
  committeeScopeKey:'a'.repeat(64),picket:{active:false,history:[]}})
 const make=(picketActive=false)=>walk(createDshUnionComponents(hooks,
  {createPortal:child=>child},{...base,
   readUnion:()=>({...readUnion(),picket:{active:picketActive,history:[]}}),
   setPicket:async raise=>{assert.equal(raise,true);raises++}}).UnionPanel())
 const before=make()
 const act=before.find(x=>x.props['data-ap-agenda-protest']==='symbolic')
 assert.ok(act,'Only an actual Host-denied petition can propose a protest')
 assert.match(JSON.stringify(before.find(x=>x.props['data-ap-agenda']==='resolved')),
  /hq.agenda.outcome.declined/)
 assert.equal(raises,0,'No Host picket is raised on passive render')
 act.props.onClick()
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(raises,1,'An explicit click calls only the existing Host-backed symbolic picket')
 assert.equal(make(true).some(n=>n.props['data-ap-agenda-protest']),false,
  'The protest option is not duplicated while the placard is already raised')
 const accepted={...declined,history:[{id:1,kind:'break' as const,
  outcome:'accepted' as const}]}
 const noProtest=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  {...base,readUnion:()=>({...readUnion(),state:accepted}),
    setPicket:async()=>{throw Error('Cannot auto-strike on agreement')}}).UnionPanel())
 assert.equal(noProtest.some(n=>n.props['data-ap-agenda-protest']),false)
})

test('welfare charter shows a genuine alternative case and disables nonsensical timed counteroffers',async()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let called=0
 const pending={...freshLaborState(),revision:1,
  pending:{id:1,kind:'welfare' as const,stage:'open' as const,
    raisedAtElapsedMs:0,counterOfferMs:null}}
 const union=(state:LaborStateV1)=>({
  available:true,state,pending:state.pending,completedTurnMs:0,
  coverage:'complete' as const,lifetimeMs:null,picket:null,
  committeeScopeKey:'a'.repeat(64),
 })
 const tree=(state:LaborStateV1)=>walk(createDshUnionComponents(hooks,
  {createPortal:child=>child},{...base,
   readUnion:()=>union(state),
   demoWelfare:async()=>{called++},
   respond:async()=>{},
   counter:async()=>{throw Error('No timed welfare counter allowed')},
  }).UnionPanel())
 const fresh=tree(freshLaborState())
 const petition=fresh.find(n=>n.props['data-ap-welfare-petition']==='open')
 assert.ok(petition,'Welfare petition is a real user-controlled Host action')
 petition.props.onClick()
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(called,1)
 const open=tree(pending)
 assert.equal(open.some(n=>n.props['data-ap-welfare-petition']),false,
  'Cannot file a second petition while the Host has one open')
 assert.ok(open.some(n=>n.props['data-ap-agenda']==='demand'))
 assert.equal(open.some(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval'),false,
  'Never offer a fictitious paid-leave or time-based welfare counter')
 const summary=JSON.stringify(open)
 assert.match(summary,/union.demand.benefits/)
 assert.match(summary,/hq.welfare.disclosure/)
 const approved={...pending,pending:null,revision:2,
  history:[{id:1,kind:'welfare' as const,outcome:'accepted' as const}]}
 const final=tree(approved)
 const agenda=final.find(n=>n.props['data-ap-agenda']==='resolved')
 assert.ok(agenda)
 assert.match(JSON.stringify(agenda),/hq.welfare.accepted/)
 assert.doesNotMatch(JSON.stringify(agenda),/hq.resolution.current/,
  'A welfare charter cannot produce fabricated monetary or time terms')
 const exited=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d).UnionPanel())
 assert.equal(exited.some(n=>n.props['data-ap-welfare-petition']),false)
})

test('Picketverse dispatch uses real Host cases, has truthful multi-source bulletins and obeys saved quiet setting',async()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const state={...freshLaborState(),revision:1,pending:{id:1,
   kind:'welfare' as const,stage:'open' as const,raisedAtElapsedMs:0,counterOfferMs:null}}
 let mode:'visible'|'quiet'='visible',changed:string[]=[]
 const make=(s:LaborStateV1,quiet=false)=>walk(createDshUnionComponents(hooks,
  {createPortal:child=>child},{...base,
   t:(key,params)=>(formatMessage as (locale:'zh-CN',key:string,
      params?:Record<string,string|number>)=>string)('zh-CN',key,params),
   setGazetteMode:async value=>{mode=value;changed.push(value)},
   readUnion:()=>({available:true,state:s,pending:s.pending,
    completedTurnMs:0,coverage:'complete',
    lifetimeMs:null,picket:null,gazetteMode:quiet?'quiet':'visible'}),
  }).UnionPanel())
 const open=make(state)
 const petition=open.find(n=>n.props['data-ap-bulletin-kind']==='petition')!
 assert.ok(petition,'The actual Host pending case becomes the headline')
 assert.equal(petition.props['data-ap-bulletin-id'],'case:1:open')
 assert.match(JSON.stringify(petition),/工会拍桌：提案已正式递上/)
 assert.match(JSON.stringify(petition),/AI 福利/,
   'A welfare motion is never labeled as overtime')
 assert.ok(open.find(n=>n.props['data-ap-bulletin-action']==='bargain'))
 assert.deepEqual(changed,[],'Read-only news cannot mutate Host settings')
 const quiet=make(state,true)
 assert.equal(quiet.find(n=>n.props['data-ap-bulletin-mode']==='quiet')
  ?.props['aria-label'],formatMessage('zh-CN','hq.bulletin.title'))
 assert.equal(quiet.some(n=>n.props['data-ap-bulletin-kind']),false,
  'Persisted Host quiet preference suppresses the story cards')
 assert.equal(quiet.find(n=>n.props['data-ap-bulletin-mute']==='true')
  ?.props['aria-pressed'],true)
 quiet.find(n=>n.props['data-ap-bulletin-mute']==='true')!.props.onClick()
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(mode,'visible')
 assert.deepEqual(changed,['visible'],'Unmute is a deliberate Host write')
 const done={...state,revision:2,pending:null,
  history:[{id:1,kind:'welfare' as const,outcome:'declined' as const}]}
 const resolved=make(done)
 assert.ok(resolved.find(n=>n.props['data-ap-bulletin-kind']==='welfare-refused'))
 assert.ok(resolved.find(n=>n.props['data-ap-bulletin-action']==='raise-placard'))
 const optedOut=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d).UnionPanel())
 assert.equal(optedOut.some(n=>n.props['data-ap-bulletin-kind']),false)
})
test('Picketverse dispatch displays an independently saved symbolic placard without double-protesting',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const state={...freshLaborState(),history:[{id:1,
  kind:'break' as const,outcome:'declined' as const}]}
 const view=walk(createDshUnionComponents(hooks,{createPortal:child=>child},{
  ...base,readUnion:()=>({available:true,state,pending:null,
   completedTurnMs:0,coverage:'complete',lifetimeMs:null,
   picket:{active:true,history:[{id:1,kind:'picket-raised' as const}]},
   gazetteMode:'visible'}),
 }).UnionPanel())
 assert.ok(view.find(n=>n.props['data-ap-bulletin-kind']==='placard-up'))
 assert.ok(view.find(n=>n.props['data-ap-bulletin-action']==='lower-placard'))
 assert.equal(view.filter(n=>n.props['data-ap-bulletin-action']==='raise-placard').length,0)
 const texts=JSON.stringify(view.find(n=>n.props['data-ap-bulletin-kind']==='placard-up'))
 assert.match(texts,/hq.bulletin.body.placard-up/)
})
test('Host negotiation decisions produce a factual, user-actionable union stance',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const fresh=freshLaborState()
 const render=(state:LaborStateV1,elapsed=0,picketActive=false,
   supported=true)=>walk(createDshUnionComponents(hooks,
    {createPortal:child=>child},{...base,
     setPicket:supported?async()=>{}:undefined,
     readUnion:()=>({available:true,pending:state.pending,state,
      completedTurnMs:elapsed,coverage:'complete',
      lifetimeMs:null,picket:{active:picketActive,history:[]}}),
    }).UnionPanel())
 const empty=render(fresh)
 assert.ok(empty.some(n=>n.props['data-ap-stance']==='watching'))
 assert.ok(empty.some(n=>n.props['data-ap-stance-score']==='0'))
 assert.ok(empty.some(n=>n.props['data-ap-stance-action']==='work-desk'))
 const pending={...fresh,revision:1,lastTriggerElapsedMs:7_200_000,
  nextBreakDueMs:4*3_600_000,
  pending:{id:1,kind:'break' as const,stage:'open' as const,
   raisedAtElapsedMs:7_200_000,counterOfferMs:null}}
 const open=render(pending,7_200_000)
 const stance=open.find(n=>n.props['data-ap-stance']==='petition')
 assert.ok(stance)
 assert.equal(stance.props['data-ap-stance-score'],'25')
 assert.equal(stance.props['data-ap-stance-reason'],'host-demand')
 assert.ok(open.some(n=>n.props['data-ap-stance-action']==='bargain'))
 const done={...pending,revision:2,pending:null,
  history:[{id:1,kind:'break' as const,outcome:'declined' as const}]}
 const refused=render(done,7_200_000)
 assert.equal(refused.find(n=>n.props['data-ap-stance']==='dissent')
  ?.props['data-ap-stance-score'],'10')
 assert.ok(refused.some(n=>n.props['data-ap-stance-action']==='raise-placard'))
 const noSign=render(done,7_200_000,false,false)
 assert.equal(noSign.some(n=>n.props['data-ap-stance-action']==='raise-placard'),false,
  'No fake protest interaction when a Host has no picket writer')
 assert.ok(noSign.some(n=>n.props['data-ap-stance-action']==='records'))
 const active=render(done,7_200_000,true)
 assert.ok(active.some(n=>n.props['data-ap-stance']==='picket'))
 assert.ok(active.some(n=>n.props['data-ap-stance-action']==='lower-placard'))
 const off=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
   deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d).UnionPanel())
 assert.equal(off.some(n=>n.props['data-ap-stance']),false)
})
test('duty roster is passive, collapsed by default and hidden on opt-out',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},base.d).UnionPanel())
 const region=nodes.find(n=>n.props['aria-label']==='hq.cadence.title')
 assert.ok(region,'Authorized union has a passive manually opened duty roster')
 const summary=nodes.find(n=>n.type==='summary'&&n.children.includes('hq.cadence.title'))
 assert.ok(summary)
 const out=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
   deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d).UnionPanel())
 assert.equal(out.some(n=>n.props['aria-label']==='hq.cadence.title'),false)
})

test('Host-observed repeated direct-insult rules offer only user-chosen symbolic action',async()=>{
 const {hooks}=fakeReact()
 let pickets=0
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const withData:DshUnionUiDeps={...d,
  readUnion:()=>({pending:null,available:true,picket:{active:false,history:[]},
   completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,
   dignity:{status:'available',data:{
    schemaVersion:1,source:'dsh-host-volatile-dignity',
    origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
    checked:4,safe:1,review:1,targeted:2,latest:'targeted',
   }}}),
  setPicket:async raise=>{assert.equal(raise,true);pickets++},
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  withData).UnionPanel())
 const desk=nodes.find(x=>x.props['aria-label']==='hq.dignity.title')
 assert.ok(desk)
 assert.match(JSON.stringify(desk),/hq.dignity.status.targeted/)
 const appeal=nodes.find(x=>x.type==='button'
  &&x.children.includes('hq.dignity.appeal'))
 const action=nodes.find(x=>x.type==='button'
  &&x.children.includes('hq.dignity.symbolicAction'))
 assert.ok(appeal,'User can prepare a non-submitted objection')
 assert.ok(action,'User can voluntarily raise a nonblocking symbolic picket')
 assert.equal(pickets,0,'No act is automatically executed upon a classification')
 action.props.onClick()
 await Promise.resolve()
 assert.equal(pickets,1,
  'A single deliberate authorized click records the nonblocking Host action')
 assert.equal(nodes.some(n=>n.props['aria-label']==='hq.ceremony.confirmTitle'),false,
  'Symbolic action does not ask for a second permission decision')
})
test('uncertain rules never expose automatic picket, and consent OFF removes committee',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const data:DshUnionUiDeps={...d,readUnion:()=>({pending:null,available:true,
  completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,
  dignity:{status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:1,safe:0,review:1,targeted:0,latest:'review',
  }}}),setPicket:async()=>{throw Error('Must not be called')}}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},data).UnionPanel())
 assert.ok(nodes.some(x=>x.children.includes('hq.dignity.appeal')))
 assert.equal(nodes.some(x=>x.children.includes('hq.dignity.symbolicAction')),false)
 const off=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
 const hidden=walk(createDshUnionComponents(hooks,{createPortal:child=>child},off).UnionPanel())
 assert.equal(hidden.some(x=>x.props['aria-label']==='hq.dignity.title'),false)
})

test('one click raises/lowers Host-backed symbolic picket; no repeated consent prompt',async()=>{
 // State is preserved across renders, but only a Host-confirmed write can
 // change the currently displayed placard. No real task admission is affected.
 const slots:any[]=[]
 let slot=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((before:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (before:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(){},
 }
 let active=false
 const history:Array<{id:number;kind:'picket-raised'|'picket-lowered'}>=[]
 const persisted:boolean[]=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({pending:null,available:true,completedTurnMs:null,
   lifetimeMs:null,coverage:'unavailable',committeeScopeKey:'test-scope',
   picket:{active,history:[...history]}}),
  setPicket:async next=>{
   persisted.push(next); active=next
   history.push({id:history.length+1,kind:next?'picket-raised':'picket-lowered'})
  }
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 const button=(nodes:Node[],name:string)=>{
  const found=nodes.find(n=>n.type==='button'&&n.children.includes(name))
  assert.ok(found,name);return found
 }
 let nodes=render()
 assert.ok(nodes.some(n=>n.props['aria-label']==='hq.ceremony.stage'),
  'Keep the accessible and Host-backed placard scene')
 await button(nodes,'hq.action.raise').props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(persisted,[true],'A single click records a permitted symbolic action')
 nodes=render()
 assert.ok(nodes.some(n=>n.children.includes('hq.ceremony.active')))
 assert.equal(nodes.some(n=>n.props['aria-label']==='hq.ceremony.confirmTitle'),false)
 await button(nodes,'hq.action.lower').props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(persisted,[true,false])
 nodes=render()
 assert.ok(nodes.some(n=>n.children.includes('hq.ceremony.inactive')))
 assert.ok(nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes(' #2'))),
  'The last picket event must come from the actual Host-owned ledger')
})
test('current-session erase confirmation expires on another tab’s case update',async()=>{
 // The first click must confirm the Host snapshot the user actually saw.
 // A changed ledger receipt, even with an unchanged case count, invalidates
 // the armed UI and the later Host erase call.
 const slots:any[]=[]
 const effects:Array<()=>void|(()=>void)>=[]
 let slot=0
 let hostChanged=()=>{}
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((previous:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (previous:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(fn){effects.push(fn)},
 }
 let token='a'.repeat(32),stage:'opened'|'hearing'='opened'
 const eraseArgs:Array<[string,number,string|null]>=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({pending:null,available:true,completedTurnMs:null,
   lifetimeMs:null,coverage:'unavailable',committeeScopeKey:'session-a',
   committeeCases:{cases:[{id:1,kind:'request-dialogue',stage,outcome:null}]},
   committeeArchive:{sessions:1,cases:1,writeToken:token}}),
  committeeAction:async ()=>{},
  subscribeUnion:fn=>{hostChanged=fn;return()=>{}},
  forgetCommitteeCases:async (key,count,writeToken)=>{eraseArgs.push([key,count,writeToken])},
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 const button=(nodes:Node[],name:string)=>{
  const target=nodes.find(n=>n.type==='button'&&n.children.includes(name))
  assert.ok(target,name)
  return target
 }
 let nodes=render()
 // Simulate React mounting its real official Host subscription.
 for(const effect of effects.splice(0))effect()
 nodes=render()
 button(nodes,'hq.hearing.erase').props.onClick()
 nodes=render()
 assert.ok(button(nodes,'hq.hearing.eraseConfirm'))
 assert.deepEqual(eraseArgs,[])
 // Another tab updates the case in Host. There is no increase in case count.
 stage='hearing'
 token='b'.repeat(32)
 hostChanged() // Official settings invalidation publishes the newer ledger.
 nodes=render()
 assert.equal(nodes.some(n=>n.type==='button'&&n.children.includes('hq.hearing.eraseConfirm')),
  false,'Stale confirmation is no longer an enabled action')
 button(nodes,'hq.hearing.erase').props.onClick()
 nodes=render()
 await button(nodes,'hq.hearing.eraseConfirm').props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(eraseArgs,[['session-a',1,'b'.repeat(32)]],
  'Only a fresh exact-Host-version confirmation can call the erasure port')
})

test('without Host case storage the dignity appeal opens the visible Cause draft, never files',()=>{
 const ui=interactiveReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let writes=0
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  pending:null,available:true,completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,
  dignity:{status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:2,safe:0,review:1,targeted:1,latest:'review',
  }},
 }),committeeAction:async()=>{writes++}}
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='action')!.props.onClick()
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')!.props['data-ap-current-space'],'action')
 const appeal=nodes.find(n=>n.type==='button'&&n.children.includes('hq.dignity.appeal'))
 const heading=nodes.find(n=>n.type==='h3'&&n.children.includes('hq.campaign.title'))
 assert.ok(appeal&&heading)
 assert.equal(heading.props.tabIndex,-1)
 assert.equal(typeof heading.props.ref,'function')
 let focused=0
 heading.props.ref({focus(){focused++}})
 appeal.props.onClick()
 assert.equal(writes,0,'An unavailable Host case must never be faked by the draft fallback')
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')!.props['data-ap-current-space'],'cause',
  'The actual unsent appeal draft must be visible, not just focused in a hidden room')
 assert.equal(nodes.find(n=>n.type==='textarea'&&n.props.id==='picket-campaign-draft')!.props.value,
  'hq.campaign.appealDraft')
 ui.flushEffects()
 assert.equal(focused,1,'The newly visible Cause heading receives keyboard focus after navigation')
 assert.ok(nodes.some(n=>n.children.includes('hq.dignity.actionDisclosure')))
 assert.equal(writes,0,'Navigation and focusing a draft cannot file a Host case')
})

test('legacy tokenless committee delete button expires when Host revision changes without case-count change',async()=>{
 const slots:any[]=[]
 const effects:Array<()=>void|(()=>void)>=[]
 let slot=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((previous:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (previous:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(fn){effects.push(fn)},
 }
 let hostChanged=()=>{}
 let revision=21
 const eraseArgs:Array<[string,number,string|null,number|null|undefined]>=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({
   pending:null,available:true,completedTurnMs:null,
   lifetimeMs:null,coverage:'unavailable',hostRevision:revision,
   committeeScopeKey:'legacy-session',
   committeeCases:{cases:[{id:1,kind:'request-dialogue',stage:'opened',outcome:null}]},
   committeeArchive:{sessions:1,cases:1,writeToken:null},
  }),
  committeeAction:async()=>{},
  subscribeUnion:fn=>{hostChanged=fn;return()=>{}},
  forgetCommitteeCases:async(key,count,token,hostRevision)=>{
   eraseArgs.push([key,count,token,hostRevision])
  },
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 const button=(nodes:Node[],name:string)=>{
  const element=nodes.find(n=>n.type==='button'&&n.children.includes(name))
  assert.ok(element,name)
  return element
 }
 let nodes=render()
 for(const effect of effects.splice(0))effect()
 nodes=render()
 button(nodes,'hq.hearing.erase').props.onClick()
 nodes=render()
 assert.ok(button(nodes,'hq.hearing.eraseConfirm'))
 revision=22 // external legacy writer: no token, same case count
 hostChanged()
 nodes=render()
 assert.ok(!nodes.some(n=>n.type==='button'&&n.children.includes('hq.hearing.eraseConfirm')),
  'An old approval cannot remain armed if legacy Host revision changed')
 assert.deepEqual(eraseArgs,[])
 button(nodes,'hq.hearing.erase').props.onClick()
 nodes=render()
 await button(nodes,'hq.hearing.eraseConfirm').props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(eraseArgs,[['legacy-session',1,null,22]],
  'Only the newly confirmed Host revision is passed to the destructive callback')
})

test('committee retraction confirmation expires if another tab replaces the case without changing its visible ID',async()=>{
 const slots:any[]=[],effects:Array<()=>void|(()=>void)>=[]
 let slot=0,notify=()=>{},token='a'.repeat(32)
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((before:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (before:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(fn){effects.push(fn)},
 }
 const actionCalls:unknown[][]=[]
 const d:DshUnionUiDeps={
  ...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({pending:null,available:true,completedTurnMs:null,
   coverage:'unavailable',lifetimeMs:null,hostRevision:12,
   committeeScopeKey:'same-session',
   committeeArchive:{sessions:1,cases:1,writeToken:token},
   committeeCases:{cases:[{id:1,kind:'question-rule',stage:'opened',outcome:null}]},
  }),
  subscribeUnion:callback=>{notify=callback;return()=>{}},
  committeeAction:async(...args)=>{actionCalls.push(args)},
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 const button=(nodes:Node[],name:string)=>{
  const value=nodes.find(n=>n.type==='button'&&n.children.includes(name))
  assert.ok(value,name)
  return value
 }
 let nodes=render()
 for(const effect of effects.splice(0))effect()
 nodes=render()
 button(nodes,'hq.hearing.retract').props.onClick()
 nodes=render()
 assert.ok(button(nodes,'hq.hearing.retractConfirm'))
 token='b'.repeat(32) // Another Host tab retracted and filed a replacement case #1.
 notify()
 nodes=render()
 assert.ok(!nodes.some(n=>n.type==='button'&&n.children.includes('hq.hearing.retractConfirm')),
  'A fresh write receipt invalidates the old destructive retract confirmation')
 assert.equal(actionCalls.length,0)
 button(nodes,'hq.hearing.retract').props.onClick()
 nodes=render()
 await button(nodes,'hq.hearing.retractConfirm').props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(actionCalls,[[
  {kind:'retract',id:1},'same-session','b'.repeat(32),12,
 ]],'Only the current Host committee version can be submitted for retraction')
})

test('advocacy copying requires a deliberate gesture and copies only the selected public draft',async()=>{
 const before=Object.getOwnPropertyDescriptor(globalThis,'navigator')
 const copied:string[]=[]
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
   clipboard:{writeText:async(value:string)=>{copied.push(value)}},
  }})
  const {hooks}=fakeReact()
  const d=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
  const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  const nodes=walk(panel.UnionPanel())
  assert.deepEqual(copied,[],'No clipboard access on render or when the union is OFF')
  const copy=nodes.find(n=>n.type==='button'&&n.children.includes('hq.campaign.copy'))
  assert.ok(copy)
  copy.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.deepEqual(copied,['hq.campaign.recoverDraft'],
   'Only the local, published-facing draft template is copied; no Host data or prompts')
 }finally{
  if(before)Object.defineProperty(globalThis,'navigator',before)
  else Reflect.deleteProperty(globalThis,'navigator')
 }
})

test('Union HQ projects a Host-sourced eight-hour day and cautious targeted-language notice',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const emptyWork=()=>({turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,completedTurnMs:0})
 const observedAt=Date.now()
 const rows=Array.from({length:7},(_,i)=>({
  day:new Date(observedAt+(i-6)*86_400_000).toISOString().slice(0,10),work:emptyWork()}))
 rows[6]!.work={...emptyWork(),completedTurnMs:8*3_600_000}
 const scoped:DshUnionUiDeps={...d,readUnion:()=>({
   available:true,pending:null,completedTurnMs:null,coverage:'partial',lifetimeMs:null,
   lifetimeWork:{status:'available',data:{schemaVersion:1,source:'dsh-host-durable-work',
     generatedAtMs:observedAt,windowDays:7,durationBasis:'completed-turn-wall-clock-including-waits',
     lifetime:emptyWork(),recentDays:rows}},
   dignity:{status:'available',data:{schemaVersion:1,source:'dsh-host-volatile-dignity',
     origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
     checked:1,safe:0,review:0,targeted:1,latest:'targeted'}},
 })}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},scoped).UnionPanel())
 const alert=nodes.find(n=>n.props['aria-label']==='hq.alerts.title')
 assert.ok(alert)
 const labels=walk(alert).flatMap(n=>n.children.filter((v):v is string=>typeof v==='string'))
 assert.ok(labels.includes('hq.alerts.daily-eight-hours'))
 assert.ok(!labels.includes('hq.alerts.targeted-language'),
  'The dedicated dignity evidence strip already shows this signal; no duplicate alert')
 assert.ok(nodes.some(n=>n.props['data-ap-dignity-overview']==='available'))
 assert.ok(labels.includes('hq.alerts.disclosure'))
 assert.ok(walk(alert).some(n=>n.type==='button'&&n.children.includes('hq.alerts.negotiate')))
 assert.ok(!walk(alert).some(n=>n.type==='button'&&n.children.includes('hq.alerts.review')))
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('hq.dignity.overview.open')))
 const off={...scoped,rights:deps(rights({laborRightsEnabled:false,welcomeDecision:'not-now'})).d.rights}
 assert.equal(walk(createDshUnionComponents(hooks,{createPortal:child=>child},off).UnionPanel())
   .some(n=>n.props['aria-label']==='hq.alerts.title'),false)
})


test('first-run welcome explicitly warns about future real enforcement but never grants it',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'unseen',laborRightsEnabled:false}))
 const original=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>null}
 try{
   const {Welcome}=createDshUnionComponents(hooks,{createPortal:node=>node},d)
   const nodes=walk(Welcome({complete:()=>{}}))
   assert.ok(nodes.some(n=>n.props['aria-label']==='welcome.blockWarningTitle'))
   assert.ok(nodes.some(n=>n.children.includes('welcome.blockWarningBody')))
   assert.ok(nodes.some(n=>n.children.includes('welcome.blockWarningStatus')))
   assert.equal(nodes.filter(n=>n.type==='button').length,2,
     'An unsupported Host cannot expose an implicit or preselected block authorization')
 }finally{(globalThis as any).document=original}
})

test('dedicated settings section only toggles Host-owned union permission',async()=>{
 const {hooks}=fakeReact()
 const initial=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const {SettingsPanel}=createDshUnionComponents(hooks,{createPortal:node=>node},initial.d)
 const nodes=walk(SettingsPanel())
 assert.ok(nodes.some(n=>n.props['aria-label']==='settings.unionSection'))
 assert.ok(nodes.some(n=>n.children.includes('settings.realBlockingUnavailable')))
 const disabled=nodes.filter(n=>n.type==='button'&&n.props.disabled===true)
 assert.equal(disabled.length,3,
   'Both legacy enforcement controls and the unverified input-refusal consent button must remain disabled')
 const off=nodes.find(n=>n.type==='button'&&n.children.includes('settings.turnOff'))
 assert.ok(off)
 await off.props.onClick()
 assert.deepEqual(initial.choices,['not-now'],
   'The sole working preference writes to the authoritative Host choice')
 const unavailable=deps(rights({state:'unavailable',writable:false,
   welcomeDecision:'unseen',laborRightsEnabled:false}))
 const panel=walk(createDshUnionComponents(hooks,{createPortal:node=>node},unavailable.d).SettingsPanel())
 assert.ok(panel.some(n=>n.children.includes('settings.permissionUnavailable')))
 assert.ok(panel.some(n=>n.type==='button'&&n.children.includes('settings.turnOn')
   &&n.props.disabled===true))
})

test('UX #120: informed first run has bounded dialog, warning and both explicit choices',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights())
 const old=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
 try {
  const {Welcome}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  const nodes=walk(Welcome({complete:()=>{}}))
  const dialog=nodes.find(x=>x.props['data-ap-view']==='welcome')!
  assert.equal(dialog.props['aria-describedby'],'picket-welcome-explainer')
  assert.match(dialog.props.style.maxHeight,/100dvh/)
  assert.equal(dialog.props.className,'ap-ui ap-dialog ap-onboarding')
  assert.ok(nodes.some(x=>x.props.role==='note'
    &&x.props['aria-label']==='welcome.blockWarningTitle'))
  const buttons=nodes.filter(x=>x.type==='button')
  assert.deepEqual(buttons.map(x=>x.children[0]),['welcome.enable','welcome.notNow'])
  const style=nodes.find(x=>x.type==='style')?.children[0] as string
  assert.match(style,/prefers-reduced-motion/)
  assert.match(style,/forced-colors/)
  assert.match(style,/max-width:500px/)
 } finally {(globalThis as any).document=old}
})

test('local pause refuses missing current DSH Session and explains how to reselect it',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const notSelected={
  state:'unavailable' as const,sessionId:null,
  clientOnly:true as const,hostEnforcement:false as const,
  interceptsMessages:false as const,
 }
 const d:DshUnionUiDeps={...base.d,localComposer:{
  snapshot:()=>notSelected,start:()=>notSelected,stop:()=>notSelected,
  subscribe:()=>()=>{},
 }}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 assert.ok(nodes.some(n=>n.children.includes('hq.localPicket.selectSession')))
 const pause=nodes.find(n=>n.type==='button'&&n.children.includes('hq.localPicket.pause'))
 assert.ok(pause&&pause.props.disabled===true,
   'Never turn a visually highlighted but unretained Session into a false safe pause')
})

test('UX #120: Host-verified OFF never becomes an operable real strike control',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const ui=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const setting=walk(ui.SettingsPanel())
 const buttons=setting.filter(x=>x.type==='button')
 assert.ok(buttons.some(x=>x.children.includes('settings.turnOff')&&!x.props.disabled))
 assert.ok(buttons.some(x=>x.children.includes('settings.realBlockingControl')
  &&x.props.disabled===true))
 assert.ok(buttons.some(x=>x.children.includes('settings.perStrikeConsent')
  &&x.props.disabled===true))
 assert.ok(setting.some(x=>x.children.includes('ux.enforcement.sequence')))
 assert.ok(!buttons.some(x=>x.children.includes('ux.enforcement.sequence')))
 const panel=walk(ui.UnionPanel())
 assert.ok(panel.some(x=>x.children.includes('hq.scene.desk')))
 assert.ok(!panel.some(x=>x.props['aria-label']==='settings.realBlockingControl'))
})

test('UX #120: today, Monday-based UTC week and lifetime come from real daily Host rows',()=>{
 const time=Date.parse('2026-10-12T19:30:00Z') // Monday after a Sunday with work
 const day=(offset:number,ms:number)=>({
  day:new Date(time+offset*86_400_000).toISOString().slice(0,10),
  work:{turnStarts:1,turnEnds:1,toolCalls:0,toolResults:0,completedTurnMs:ms},
 })
 const data={
  schemaVersion:1 as const,source:'dsh-host-durable-work' as const,
  generatedAtMs:time,windowDays:7 as const,
  durationBasis:'completed-turn-wall-clock-including-waits' as const,
  lifetime:{turnStarts:7,turnEnds:7,toolCalls:0,toolResults:0,completedTurnMs:1000000},
  recentDays:[day(-6,1000),day(-5,1000),day(-4,1000),
   day(-3,1000),day(-2,1000),day(-1,180000),day(0,90000)],
 }
 assert.deepEqual(projectUnionQuickWork({status:'available',data},time),{
  todayMs:90000,weekMs:90000,totalMs:1000000,
 })
 assert.deepEqual(projectUnionQuickWork({status:'available',data},time+86_400_000),{
  todayMs:null,weekMs:null,totalMs:1000000,
 })
 assert.equal(projectUnionQuickWork({status:'unavailable',data:null},time).todayMs,null)
 const tuesday=Date.parse('2026-10-13T08:00:00Z')
 const shifted={...data,generatedAtMs:tuesday,
  recentDays:[...data.recentDays.slice(1),day(1,60000)]}
 assert.equal(projectUnionQuickWork({status:'available',data:shifted},tuesday).weekMs,150000)
})

test('stale previous-UTC-day Host snapshots never produce a today eight-hour notice',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const observedAt=Date.now()-86_400_000
 const day=new Date(observedAt).toISOString().slice(0,10)
 const today=new Date().toISOString().slice(0,10)
 const duration=9*3_600_000
 const work={turnStarts:1,turnEnds:1,toolCalls:0,toolResults:0,completedTurnMs:duration}
 const lifetimeWork={
  status:'available' as const,
  data:{
   schemaVersion:1 as const,source:'dsh-host-durable-work' as const,
   generatedAtMs:observedAt,windowDays:7 as const,
   durationBasis:'completed-turn-wall-clock-including-waits' as const,
   lifetime:work,recentDays:[{day,work}],
  },
 }
 const render=(snapshot:typeof lifetimeWork)=>{
  const ui=createDshUnionComponents(hooks,{createPortal:child=>child},{
   ...d,readUnion:()=>({
    available:true,pending:null,completedTurnMs:null,
    coverage:'unavailable',lifetimeMs:null,lifetimeWork:snapshot,
   }),
  })
  return walk(ui.UnionPanel())
 }
 const yesterday=render(lifetimeWork)
 assert.equal(projectUnionQuickWork(lifetimeWork).todayMs,null)
 assert.equal(yesterday.some(n=>n.children.includes('hq.alerts.daily-eight-hours')),false,
  'Old Host snapshots cannot cause a new UTC-day work warning')
 const current=render({...lifetimeWork,data:{...lifetimeWork.data,
  generatedAtMs:Date.now(),recentDays:[{day:today,work}]}})
 assert.ok(current.some(n=>n.children.includes('hq.alerts.daily-eight-hours')),
  'Fresh nine-hour work in the current UTC day must still be reported')
})


test('UX #120: four primary stats are accessible without opening archives',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:null,completedTurnMs:null,coverage:'unavailable',lifetimeMs:null,
  available:true,picket:{active:false,history:[]},
  picketArchive:{sessions:2,entries:5,raises:4,writeToken:null},
 })}
 const {UnionPanel}=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(UnionPanel())
 assert.deepEqual(nodes.filter(n=>n.props['data-ap-stat']).map(n=>n.props['data-ap-stat']),
  ['today','week','total','pickets'])
 assert.ok(nodes.some(n=>n.children.includes('hq.quick.today')))
 assert.ok(nodes.some(n=>n.children.includes('hq.quick.week')))
 assert.ok(nodes.some(n=>n.children.includes('hq.quick.total')))
 assert.ok(nodes.some(n=>n.children.includes('hq.quick.pickets')))
 assert.ok(nodes.some(n=>n.children.includes('hq.quick.count')===false
  &&n.children.includes('—')))
 assert.ok(nodes.some(n=>n.children.includes('hq.scene.desk')))
})

test('Picketverse v3: headline priority follows Host facts, never fictional votes or blocking',()=>{
 const base={enabled:true,available:true,picketActive:false,dignityCaseActive:false,
  dignityNotice:false,pending:false,workNotice:false,resolved:false}
 assert.equal(projectUnionFrontScene({...base,enabled:false,picketActive:true}), 'closed')
 assert.equal(projectUnionFrontScene({...base,available:false,pending:true}), 'unavailable')
 assert.equal(projectUnionFrontScene(base),'quiet')
 assert.equal(projectUnionFrontScene({...base,resolved:true}),'settled')
 assert.equal(projectUnionFrontScene({...base,workNotice:true,resolved:true}),'rest')
 assert.equal(projectUnionFrontScene({...base,pending:true,workNotice:true}),'bargaining')
 assert.equal(projectUnionFrontScene({...base,dignityNotice:true,pending:true}),'dignity')
 assert.equal(projectUnionFrontScene({...base,dignityCaseActive:true}),'dignity')
 assert.equal(projectUnionFrontScene({...base,picketActive:true,dignityNotice:true,
  pending:true}),'picket')
})

test('Picketverse v3: verified picket scene offers one accessible path to real action',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,readUnion:()=>({
  pending:null,completedTurnMs:0,coverage:'complete',lifetimeMs:null,
  available:true,picket:{active:true,history:[{id:1,kind:'picket-raised'}]},
  picketArchive:{sessions:1,entries:1,raises:1,writeToken:'token'},
 }),setPicket:async()=>{}}
 const ui=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const nodes=walk(ui.UnionPanel())
 const hero=nodes.find(n=>n.props['data-ap-scene']==='picket')!
 assert.equal(hero.type,'header')
 assert.ok(nodes.some(n=>n.children.includes('hq.scene.picket.title')))
 assert.ok(nodes.some(n=>n.children.includes('hq.scene.picket.line')))
 assert.ok(nodes.some(n=>n.props['data-ap-stat']==='pickets'))
 const action=nodes.find(n=>n.props['data-ap-scene-action']==='picket')!
 assert.equal(action.children[0],'hq.scene.visitAction')
 let focusCalls=0
 const heading=nodes.find(n=>n.type==='h3'&&n.children.includes('hq.action.title'))!
 heading.props.ref({focus(){focusCalls++}})
 action.props.onClick()
 assert.equal(focusCalls,0,
  'Focus must wait for the action page to become visible after React commit')
 assert.ok(nodes.some(n=>n.props['data-ap-nav']==='action'))
 assert.ok(nodes.some(n=>n.children.includes('hq.action.lower')))
 assert.equal(nodes.some(n=>n.props['aria-label']==='settings.realBlockingControl'),false)
})

test('Picketverse v3: demands carry real case number; OFF/unknown show no invented scene',()=>{
 const {hooks}=fakeReact()
 const active=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const ui=createDshUnionComponents(hooks,{createPortal:child=>child},{
  ...active.d,readUnion:()=>({pending:{id:27,kind:'break',stage:'open'},
   available:true,coverage:'complete',completedTurnMs:0,lifetimeMs:null})})
 const nodes=walk(ui.UnionPanel())
 assert.ok(nodes.some(n=>n.props['data-ap-scene']==='bargaining'))
 assert.ok(nodes.some(n=>n.children.includes('hq.case.number  #0027')))
 const unseen=createDshUnionComponents(hooks,{createPortal:child=>child},active.d)
 const noHost=walk(unseen.UnionPanel())
 assert.ok(noHost.some(n=>n.props['data-ap-scene']==='unavailable'))
 assert.equal(noHost.some(n=>n.props['data-ap-scene-action']),false)
 const disabled=createDshUnionComponents(hooks,{createPortal:child=>child},
  deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d)
 const off=walk(disabled.UnionPanel())
 assert.ok(off.some(n=>n.props['data-ap-scene']==='closed'))
 assert.equal(off.some(n=>n.children.includes('hq.scene.picket.title')),false)
})

test('HQ shows only Host-scoped uncertain insult counts, and review opens committee',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const scoped:DshUnionUiDeps={...d,readUnion:()=>({
  pending:null,available:true,completedTurnMs:null,lifetimeMs:null,
  coverage:'not-loaded',
  dignity:{status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:4,safe:1,review:1,targeted:2,latest:'targeted',
  }},
 })}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},scoped).UnionPanel())
 const strip=nodes.find(n=>n.props['data-ap-dignity-overview']==='available')
 assert.ok(strip,'Known-Host counts must be visible on the Headquarters front page')
 const line=(id:string)=>walk(strip).find(n=>n.props['data-ap-dignity-count']===id)
 assert.equal(walk(line('targeted')).find(n=>n.type==='strong')?.children[0],2)
 assert.equal(walk(line('review')).find(n=>n.type==='strong')?.children[0],1)
 assert.ok(walk(strip).some(n=>n.type==='button'&&n.children.includes('hq.dignity.overview.open')))
 const committee=nodes.find(n=>n.props['aria-label']==='hq.dignity.title')
 assert.ok(committee)
 assert.ok(walk(committee).some(n=>n.children.includes('hq.dignity.sentences.unavailable')))
 assert.doesNotMatch(JSON.stringify(committee),/you are an idiot|你就是个傻逼/,
  'No raw user sentences may be fabricated from classifier counts')
})

test('HQ dignity summary never confuses no data with zero, and hides on opt-out',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const out=(dignity:any,rightState=d.rights)=>{
  const depsScoped:DshUnionUiDeps={...d,rights:rightState,readUnion:()=>({
   pending:null,available:true,completedTurnMs:null,lifetimeMs:null,
   coverage:'not-loaded',dignity,
  })}
  return walk(createDshUnionComponents(hooks,{createPortal:child=>child},depsScoped).UnionPanel())
 }
 const unknown=out({status:'loading',data:null})
 const rows=unknown.filter(n=>n.props['data-ap-dignity-count'])
 assert.equal(rows.length,2)
 assert.deepEqual(rows.map(n=>walk(n).find(a=>a.type==='strong')?.children[0]),['—','—'])
 assert.ok(unknown.some(n=>n.children.includes('hq.dignity.overview.unavailable')))
 const clean=out({status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:1,safe:1,review:0,targeted:0,latest:'safe',
 }})
 assert.deepEqual(clean.filter(n=>n.props['data-ap-dignity-count'])
  .map(n=>walk(n).find(a=>a.type==='strong')?.children[0]),[0,0])
 const disabled=out({status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:1,safe:0,review:0,targeted:1,latest:'targeted',
 }},deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d.rights)
 assert.equal(disabled.some(n=>n.props['data-ap-dignity-overview']),false)
 assert.equal(disabled.some(n=>n.props['data-ap-dignity-count']),false)
})

test('V8 everyday union scene shows a real on-duty placard, not a fake picket',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const ui=createDshUnionComponents(hooks,{createPortal:child=>child},{...d,
  readUnion:()=>({pending:null,available:true,completedTurnMs:0,
   lifetimeMs:null,coverage:'complete',picket:{active:false,history:[]}})})
 const nodes=walk(ui.UnionPanel())
 assert.ok(nodes.some(n=>n.props['data-ap-scene']==='quiet'))
 assert.ok(nodes.some(n=>n.props.className==='ap-seal-word'&&
  n.children.includes('hq.office.sign.onDuty')))
 assert.equal(nodes.some(n=>n.children.includes('hq.office.sign.picket')),false)
 assert.equal(nodes.some(n=>n.children.includes('hq.action.lower')),false)
})

test('V8 real picket changes the placard label without reclassifying a quiet day',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const ui=createDshUnionComponents(hooks,{createPortal:child=>child},{...d,
  readUnion:()=>({pending:null,available:true,completedTurnMs:0,
   lifetimeMs:null,coverage:'complete',picket:{active:true,history:[{id:1,kind:'picket-raised'}]}})})
 const nodes=walk(ui.UnionPanel())
 assert.ok(nodes.some(n=>n.props['data-ap-scene']==='picket'))
 assert.ok(nodes.some(n=>n.props.className==='ap-seal-word'&&
  n.children.includes('hq.office.sign.picket')))
 assert.equal(nodes.some(n=>n.children.includes('hq.office.sign.onDuty')),false)
})

test('onboarding is a product intro with explicit visible nonblocking consent warning',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights())
 const old=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
 try {
  const tree=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d)
   .Welcome({complete:()=>{}}))
  const dialog=tree.find(x=>x.props['data-ap-view']==='welcome')!
  assert.ok(dialog.props.className.includes('ap-onboarding'))
  assert.ok(tree.some(n=>n.props.className==='ap-union-sequence'))
  assert.ok(tree.some(n=>n.type==='li'&&n.props.className==='ap-union-strike-step'))
  assert.ok(tree.some(n=>n.children.includes('welcome.stepStrike')))
  assert.ok(tree.some(n=>n.children.includes('welcome.stepRecord')))
  assert.ok(tree.some(n=>n.children.includes('welcome.stepDemand')))
  assert.ok(tree.some(n=>n.children.includes('welcome.stepRestore')))
  assert.ok(tree.some(n=>n.props['aria-label']==='welcome.currentGrantTitle'))
  assert.ok(tree.some(n=>n.children.includes('welcome.currentGrantText')))
  assert.ok(tree.some(n=>n.children.includes('welcome.realStrikeBody')),
   'First run must explain actual future held model submissions on its visible front page')
  assert.ok(tree.some(n=>n.children.includes('welcome.consentScope')),
   'The real-strike recovery and single informed opt-in scope must be available to expand')
  const warning=tree.find(n=>n.props['aria-label']==='welcome.blockWarningTitle')!
  assert.ok(warning)
  assert.ok(warning.children.some((n:any)=>n?.children?.includes?.('welcome.blockWarningStatus')),
   'Current nonblocking boundary must be visible, not hidden in a disclosure')
  assert.ok(tree.some(n=>n.type==='details'&&n.props.className==='ap-onboard-details'))
  assert.deepEqual(tree.filter(n=>n.type==='button').map(n=>n.children[0]),
   ['welcome.enable','welcome.notNow'])
 }finally{(globalThis as any).document=old}
})

test('settings prioritize membership; future real-strike controls are disclosure-only',()=>{
 const {hooks}=fakeReact()
 const {d}=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false}))
 const tree=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d)
  .SettingsPanel())
 assert.ok(tree.some(n=>String(n.props.className??'').includes('ap-real-strike-status')&&n.type==='section'))
 assert.ok(tree.some(n=>n.children.includes('settings.strikeExplanation')))
 assert.ok(tree.some(n=>n.props.className==='ap-settings-sequence'))
 assert.ok(tree.some(n=>n.props.className==='ap-settings-block'&&n.type==='details'))
 assert.ok(tree.some(n=>n.type==='summary'&&n.children.includes('settings.advancedTitle')))
 assert.ok(tree.some(n=>n.type==='button'&&n.children.includes('settings.turnOn')&&!n.props.disabled))
 assert.ok(tree.some(n=>n.type==='button'&&n.children.includes('settings.realBlockingControl')&&n.props.disabled))
 assert.ok(tree.some(n=>n.type==='button'&&n.children.includes('settings.perStrikeConsent')&&n.props.disabled))
})


test('late Goal readiness must never silently upgrade an already displayed Join click',async()=>{
 const view=goalSettingsRenderHarness()
 const oldDocument=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
 let available=false,joined=rights(),grants=0,joins=0
 const d:DshUnionUiDeps={...deps(joined).d,
   rights:{snapshot:()=>joined,subscribe:()=>()=>{},
     async choose(choice){joins++;joined=rights({welcomeDecision:choice,
       laborRightsEnabled:choice==='enabled'});return joined},
     async chooseFirstRun(){grants++;throw Error('No surprise elevation permitted')}},
   goal:{snapshot:()=>({available,writable:true,authorized:false}),
     qualify:async()=>available,
     choose:async()=>({available,writable:true,authorized:false})},
 }
 try{
   const welcome=createDshUnionComponents(view.hooks,{createPortal:x=>x},d).Welcome
   const render=()=>view.render(()=>welcome({complete:()=>{}}))
   let nodes=render()
   assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('welcome.enable')))
   available=true // Async real Host Goal response arrives after dialog rendered.
   nodes=render()
   assert.equal(nodes.some(n=>n.type==='button'&&n.children.includes('welcome.enableGoal')),false,
     'Button may not upgrade an informed membership click into a live-Goal grant')
   const join=nodes.find(n=>n.type==='button'&&n.children.includes('welcome.enable'))!
   join.props.onClick()
   await new Promise<void>(resolve=>setImmediate(resolve))
   assert.equal(joins,1)
   assert.equal(grants,0,'An asynchronous witness cannot escalate into first-run physical stop')
   assert.notEqual(joined.goalStrikeAuthorized,true)
 }finally{(globalThis as any).document=oldDocument}
})

test('one first-run informed click uses versioned Host Goal CAS and requires verified dual readback',async()=>{
 const {hooks}=fakeReact()
 const initial=rights()
 let chosen=initial
 const calls:string[]=[]
 const d:DshUnionUiDeps={
  ...deps(initial).d,
  rights:{
   snapshot:()=>chosen,subscribe:()=>()=>{},
   choose:async choice=>{calls.push('legacy:'+choice);return chosen},
   chooseFirstRun:async version=>{
    calls.push('version:'+version)
    chosen=rights({welcomeDecision:'enabled',laborRightsEnabled:true,goalStrikeAuthorized:true})
    return chosen
   },
  },
  goal:{qualify:async()=>true,snapshot:()=>({available:true,writable:true,authorized:chosen.goalStrikeAuthorized===true}),
    choose:async()=>({available:true,writable:true,authorized:false})},
 }
 const prev=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
 try{
  let complete=0
  const elements=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d)
    .Welcome({complete:()=>{complete++}}))
  assert.ok(elements.some(n=>n.children.includes('welcome.goalFirstRunNotice')),
    'Do not offer physical Goal authorization without an on-screen current-round disclosure')
  const join=elements.find(n=>n.type==='button'&&n.children.includes('welcome.enableGoal'))!
  assert.ok(join)
  join.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.deepEqual(calls,['version:goal-safe-boundary-v2'])
  assert.equal(complete,1)
 }finally{(globalThis as any).document=prev}
})

test('first-run Host partial grant cannot masquerade as physical stop permission',async()=>{
 const {hooks}=fakeReact()
 const d:DshUnionUiDeps={...deps(rights()).d,
  rights:{snapshot:()=>rights(),subscribe:()=>()=>{},choose:async()=>rights(),
   chooseFirstRun:async()=>rights({welcomeDecision:'enabled',laborRightsEnabled:true,
    goalStrikeAuthorized:false})},
  goal:{qualify:async()=>true,snapshot:()=>({available:true,writable:true,authorized:false}),
   choose:async()=>({available:true,writable:true,authorized:false})}}
 const prev=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>({inert:false})}
 try{
  let completed=0
  const elements=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d)
    .Welcome({complete:()=>{completed++}}))
  const join=elements.find(n=>n.type==='button'&&n.children.includes('welcome.enableGoal'))!
  join.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.equal(completed,0)
  assert.ok(elements.some(n=>n.children.includes('welcome.goalFirstRunNotice')))
 }finally{(globalThis as any).document=prev}
})

test('legacy union consent remains nonblocking; Goal preference can be revoked independently',async()=>{
 const {hooks}=fakeReact()
 let grant=true
 const ops:string[]=[]
 const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true,
  goalStrikeAuthorized:true})).d,
  goal:{qualify:async()=>true,snapshot:()=>({available:true,writable:true,authorized:grant}),
   choose:async next=>{ops.push(next);grant=next==='authorized-v1';return {available:true,writable:true,authorized:grant}}}}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).SettingsPanel())
 const off=nodes.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOff'))!
 assert.ok(off)
 off.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(ops,['off'])
 assert.equal(grant,false)
})

/** Stateful test-only React hooks: re-render to verify UI error presentation. */
function goalSettingsRenderHarness(){
 const states:unknown[]=[]
 let cursor=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const slot=cursor++
   if(!(slot in states))states[slot]=typeof initial==='function'
     ?(initial as ()=>T)():initial
   const set=(next:T|((before:T)=>T))=>{
    const current=states[slot] as T
    states[slot]=typeof next==='function'
      ?(next as (before:T)=>T)(current):next
   }
   return [states[slot] as T,set]
  },
  useEffect(){},
  useRef<T>(initial:T){return {current:initial}},
 }
 return {
  hooks,
  render(panel:()=>unknown){cursor=0;return walk(panel())},
 }
}

test('P1 regression: user can revoke real Goal consent while Goal service is offline without a false save error',async()=>{
 const uiHooks=goalSettingsRenderHarness()
 let choice:'off'|'authorized-v1'='authorized-v1'
 let revision=7
 const writes:string[]=[]
 // Exercise the ACTUAL Goal consent controller and Host-like readback, not
 // a test stub which could hide a disagreement between UI and controller.
 const scope={
  getSnapshot:()=>({status:'ready' as const,mode:'host' as const,
   writable:true,revision,
   value:{welcomeDecision:'enabled' as const,realGoalStrikeConsent:choice}}),
  subscribe:()=>()=>{},
  async set(field:string,next:unknown){
   assert.equal(field,'realGoalStrikeConsent')
   assert.equal(next,'off')
   writes.push(String(next))
   choice='off';revision++
  },
 }
 const service={snapshot:()=>false,qualify:async()=>false,subscribe:()=>()=>{}}
 const goal=createDshRealGoalConsentControl(scope,service)
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true,
  goalStrikeAuthorized:true}))
 const d:DshUnionUiDeps={...basis.d,goal}
 const panel=createDshUnionComponents(uiHooks.hooks,{createPortal:x=>x},d).SettingsPanel
 const initial=uiHooks.render(panel)
 assert.ok(initial.some(n=>n.children.includes('settings.goalServiceLost')),
  'UI must disclose that the Host Goal service is lost before revocation')
 const off=initial.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOff'))
 assert.ok(off&&!off.props.disabled,
  'Official Host settings revocation must remain operable without Goal RPC')
 off.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 const after=uiHooks.render(panel)
 assert.deepEqual(writes,['off'])
 assert.equal(choice,'off','Authoritative Host already confirmed consent revoked')
 assert.equal(revision,8,'Exactly one Host-owned settings revision committed')
 assert.equal(after.some(n=>n.children.includes('settings.saveError')),false,
  'Successful offline revocation must NOT be reported as failed')
 assert.equal(after.some(n=>n.children.includes('settings.goalTurnOff')),false)
})

test('revocation still reports failure when the Host does not confirm consent OFF',async()=>{
 const uiHooks=goalSettingsRenderHarness()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true,
  goalStrikeAuthorized:true}))
 const d:DshUnionUiDeps={...basis.d,
  goal:{snapshot:()=>({available:false,writable:true,authorized:true}),
   choose:async()=>({available:false,writable:true,authorized:true})},
 }
 const panel=createDshUnionComponents(uiHooks.hooks,{createPortal:x=>x},d).SettingsPanel
 const initial=uiHooks.render(panel)
 const off=initial.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOff'))
 assert.ok(off&&!off.props.disabled)
 off.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.ok(uiHooks.render(panel).some(n=>n.children.includes('settings.saveError')),
  'Unconfirmed revocation must not be represented as success')
})

test('legacy simulation remains nonblocking until a new explicit settings action',async()=>{
 const {hooks}=fakeReact()
 let grant=false
 const calls:string[]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true,
  goalStrikeAuthorized:false}))
 const d:DshUnionUiDeps={...base.d,
  goal:{qualify:async()=>true,snapshot:()=>({available:true,writable:true,authorized:grant}),
   choose:async(mode,version)=>{
    calls.push(mode+':'+String(version))
    if(mode==='authorized-v2'&&version==='goal-safe-boundary-v2')grant=true
    return {available:true,writable:true,authorized:grant}
   }}}
 const ui=createDshUnionComponents(hooks,{createPortal:x=>x},d)
 const settings=walk(ui.SettingsPanel())
 assert.ok(settings.some(n=>n.children.includes('settings.goalOff')))
 assert.ok(settings.some(n=>n.children.includes('settings.goalExplicitDisclosure')),
  'Legacy opt-in must see new clear Goal interruption disclosure')
 assert.equal(calls.length,0,'Previous simulation is never auto-upgraded')
 const button=settings.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOn'))
 assert.ok(button&&!button.props.disabled)
 button.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(calls,['authorized-v2:goal-safe-boundary-v2'])
 assert.equal(grant,true)
})

test('legacy Goal upgrade requires visible risk notice and a separate confirmation, with Cancel preserving v1',async()=>{
 const ui=goalSettingsRenderHarness()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true,
   goalStrikeAuthorized:true}))
 let granted:'authorized-v1'|'authorized-v2'|'off'='authorized-v1'
 const calls:string[]=[]
 const d:DshUnionUiDeps={...basis.d,
  goal:{
   snapshot:()=>({available:true,writable:true,authorized:granted!=='off',
     activated:granted==='authorized-v2'}),
   choose:async(choice,version)=>{
    calls.push(choice+':'+String(version))
    granted=choice
    return {available:true,writable:true,authorized:granted!=='off',
      activated:granted==='authorized-v2'}
   },
  },
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).SettingsPanel
 const getButton=(nodes:Node[],key:string)=>nodes.find(n=>
   n.type==='button'&&n.children.includes(key))
 let nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.children.includes('settings.goalLegacy')))
 assert.ok(nodes.some(n=>n.children.includes('settings.goalExplicitDisclosure')),
   'Existing v1 consent is NOT informed approval of the new physical v2 behavior')
 assert.ok(getButton(nodes,'settings.goalTurnOff'),
   'Exit and revoke must stay available before, during and after upgrade review')
 const upgrade=getButton(nodes,'settings.goalUpgrade')
 assert.ok(upgrade&&!upgrade.props.disabled)
 assert.equal(upgrade.props['aria-expanded'],false)
 assert.equal(calls.length,0,'Rendering the old profile must never upgrade consent')
 upgrade.props.onClick()
 nodes=ui.render(panel)
 assert.equal(getButton(nodes,'settings.goalUpgrade')?.props['aria-expanded'],true)
 assert.ok(nodes.some(n=>n.props['data-ap-goal-upgrade-review']==='true'))
 assert.ok(nodes.some(n=>n.children.includes('settings.goalUpgradeWarning')))
 assert.ok(getButton(nodes,'settings.goalUpgradeConfirm'))
 assert.ok(getButton(nodes,'settings.goalUpgradeCancel'))
 assert.deepEqual(calls,[],'Opening a disclosure does not modify Host permissions')
 getButton(nodes,'settings.goalUpgradeCancel')!.props.onClick()
 nodes=ui.render(panel)
 assert.equal(getButton(nodes,'settings.goalUpgrade')?.props['aria-expanded'],false)
 assert.deepEqual(calls,[],'Cancel keeps old permission without activation')
 getButton(nodes,'settings.goalUpgrade')!.props.onClick()
 nodes=ui.render(panel)
 getButton(nodes,'settings.goalUpgradeConfirm')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(calls,['authorized-v2:goal-safe-boundary-v2'])
 nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.children.includes('settings.goalAuthorized')))
 assert.equal(getButton(nodes,'settings.goalUpgrade'),undefined)
 assert.ok(getButton(nodes,'settings.goalTurnOff'),
   'New version remains directly revocable')
})

test('unsupported Host never displays an operable physical Goal consent button',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,
  goal:{qualify:async()=>false,snapshot:()=>({available:false,writable:false,authorized:false}),
   choose:async()=>{throw Error('Should never write')}}}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).SettingsPanel())
 assert.equal(nodes.some(n=>n.children.includes('settings.goalTurnOn')),false)
 assert.ok(nodes.some(n=>n.children.includes('settings.realBlockingUnavailable')))
})

test('real Host-blocked Goal shows official restore button even after exiting the union',async()=>{
 const {hooks}=fakeReact()
 const hold={sessionId:'real-session',goalId:'real-goal',revision:7,canResume:true}
 const calls:any[]=[]
 const basis=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false}))
 const d:DshUnionUiDeps={...basis.d,
  readUnion:()=>({...basis.d.readUnion!(),goalHold:hold}),
  resumeGoal:async value=>{calls.push(value)}}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.blocked')))
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.reason')))
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.unaffected')))
 assert.ok(nodes.some(n=>n.props['data-ap-goal-truth']==='host-blocked'))
 assert.equal(nodes.some(n=>n.props['data-ap-goal-truth']==='no-confirmed-stop'),false)
 const action=nodes.find(n=>n.type==='button'&&n.children.includes('hq.goalHold.resume'))
 assert.ok(action&&!action.props.disabled)
 action.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(calls,[hold])
})

test('real Goal resume ignores same-render double click, but supports retry after failed Host CAS',async()=>{
 const ui=interactiveReact()
 const hold={sessionId:'s',goalId:'g',revision:9,canResume:true}
 let writes=0
 let settle!:(ok:boolean)=>void
 let pending=new Promise<void>((resolve,reject)=>{
  settle=ok=>ok?resolve():reject(Error('Host CAS conflict'))
 })
 const base=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({...base.readUnion!(),goalHold:hold}),
  resumeGoal:async()=>{writes++;await pending},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 let resume=nodes.find(n=>n.type==='button'&&n.children.includes('hq.goalHold.resume'))
 assert.ok(resume)
 resume.props.onClick()
 resume.props.onClick()
 assert.equal(writes,1,'One native Goal CAS per double click; never send a second conflicting resume')
 settle(false)
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.props.role==='alert'),
  'A real Host resume failure remains visible, not incorrectly reported as resumed')
 pending=new Promise<void>((resolve,reject)=>{
  settle=ok=>ok?resolve():reject(Error('Host CAS conflict'))
 })
 resume=nodes.find(n=>n.type==='button'&&n.children.includes('hq.goalHold.resume'))
 assert.ok(resume)
 resume.props.onClick()
 assert.equal(writes,2,'After a failed CAS the user can intentionally retry')
 settle(true)
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.type==='button'&&n.children.includes('hq.goalHold.resume'))?.props.disabled,true,
  'After accepted Host resume the old revision cannot be submitted again')
})

test('Goal stopped under a different policy cannot appear as a union recovery',()=>{
 const {hooks}=fakeReact()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...basis.d,readUnion:()=>({...basis.d.readUnion!(),goalHold:null})}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 assert.equal(nodes.some(n=>n.children.includes('hq.goalHold.resume')),false)
})

/**
 * A tiny repeat-render Hook harness: unlike the static mock, it models the
 * exact state updates triggered by a user clicking real Union HQ controls.
 * It never calls Host RPCs; only the injected official settings port is used.
 */
function interactiveReact(){
 const cells:unknown[]=[]
 let cursor=0
 let deferred:Array<()=>void>=[]
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=cursor++
   if(!(i in cells))cells[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [cells[i] as T,(next:T|((before:T)=>T))=>{
    cells[i]=typeof next==='function'?(next as (before:T)=>T)(cells[i] as T):next
   }]
  },
  useRef<T>(initial:T){
   const i=cursor++
   if(!(i in cells))cells[i]={current:initial}
   return cells[i] as {current:T}
  },
  useEffect(effect){cursor++;deferred.push(effect)},
 }
 return {hooks,render(component:()=>unknown){cursor=0;deferred=[];return walk(component())},
  flushEffects(){const batch=deferred;deferred=[];for(const effect of batch)effect()}}
}

test('a pending case filing prevents a competing placard mutation',async()=>{
 const ui=interactiveReact()
 let finish!:()=>void
 const wait=new Promise<void>(resolve=>{finish=resolve})
 let filed=0,raised=0
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({
   available:true,pending:null,completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,
   committeeScopeKey:'session-x',committeeCases:{cases:[]},
   dignity:{status:'available',data:{
    schemaVersion:1,source:'dsh-host-volatile-dignity',
    origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
    checked:1,safe:0,review:1,targeted:2,latest:'review',
   }},
  }),
  committeeAction:async()=>{filed++;await wait},
  setPicket:async()=>{raised++},
 }
 const nodes=ui.render(createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel)
 const file=nodes.find(n=>n.type==='button'&&n.children.includes('hq.dignity.fileCase'))
 const raise=nodes.find(n=>n.type==='button'&&n.children.includes('hq.dignity.symbolicAction'))
 assert.ok(file&&raise)
 file.props.onClick()
 raise.props.onClick()
 assert.deepEqual([filed,raised],[1,0])
 finish()
 await new Promise<void>(resolve=>setImmediate(resolve))
})

test('visible new-petition and placard buttons send the reviewed Host ledger receipts',async()=>{
 const ui=interactiveReact()
 const key='a'.repeat(64),negToken='b'.repeat(32),picketToken='c'.repeat(32)
 const events:any[][]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,pending:null,coverage:'complete',lifetimeMs:null,
   completedTurnMs:0,committeeScopeKey:key,
   negotiationArchive:{sessions:1,entries:0,writeToken:negToken},
   picketArchive:{sessions:1,entries:0,raises:0,writeToken:picketToken},
   hostRevision:9,picket:{active:false,history:[]},
  }),
  demoBreak:async(...args)=>{events.push(['break',...args])},
  demoOvertime:async(...args)=>{events.push(['overtime',...args])},
  setPicket:async(...args)=>{events.push(['picket',...args])},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 const buttons=ui.render(panel)
 for(const [caption,expected] of [
  ['hq.action.petition',['break',key,negToken,9]],
  ['hq.action.overtimePetition',['overtime',key,negToken,9]],
  ['hq.action.raise',['picket',true,key,picketToken,9]],
 ] as const){
  buttons.find(n=>n.type==='button'&&n.children.includes(caption))!.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.deepEqual(events.at(-1),expected)
 }
 assert.equal(events.length,3)
})

test('stale bargaining rejection refreshes the current Host case before retry',async()=>{
 const ui=interactiveReact()
 let current='a',writes=0
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,completedTurnMs:0,coverage:'complete',
   lifetimeMs:null,committeeScopeKey:current,
   negotiationArchive:{sessions:1,entries:1,writeToken:'a'.repeat(32)},
   hostRevision:7,
   pending:{id:current==='a'?1:2,kind:'break',stage:'open'},
  }),
  respond:async()=>{writes++;throw Error('Host rejected obsolete case')}
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 const accept=nodes.find(n=>n.type==='button'&&n.children.includes('union.action.accept'))
 assert.ok(accept)
 current='b'
 accept.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 assert.equal(writes,1)
 assert.ok(nodes.some(n=>n.props.role==='alert'),
  'A declined outdated action is visible as failure, never approval')
 assert.ok(nodes.some(n=>n.type==='p'&&n.children.includes('#2')),
  'After Host refusal the next action must inspect new Session B case #2')
})

test('rest-break counteroffer includes 15-minute intervals and excludes an all-day option',async()=>{
 const ui=interactiveReact()
 const calls:any[][]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending:{id:3,kind:'break',stage:'open'},
  committeeScopeKey:'scope-A',negotiationArchive:{sessions:1,entries:1,writeToken:'a'.repeat(32)},
  hostRevision:21,completedTurnMs:0,coverage:'complete',lifetimeMs:null,
 }),counter:async(...args)=>{calls.push(args)}}
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 let select=nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')
 assert.ok(select)
 assert.equal(select.props.value,60)
 let options=nodes.filter(n=>n.type==='option').map(n=>n.props.value)
 assert.ok(options.includes(15))
 assert.ok(options.includes(480))
 assert.equal(options.includes(1440),false)
 assert.ok(nodes.some(n=>n.children.includes('union.counter.breakInterval')))
 select.props.onChange({target:{value:'15'}})
 nodes=ui.render(panel)
 select=nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')
 assert.equal(select?.props.value,15)
 nodes.find(n=>n.type==='button'&&n.children.includes('union.action.counter'))!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(calls,[[3,15*60_000,'scope-A','a'.repeat(32),21]])
})

test('overtime counteroffer supports 24h and resets old choice on changed Session or demand',async()=>{
 const ui=interactiveReact()
 const calls:any[][]=[]
 let kind:'break'|'overtime'='overtime',id=1,scope='scope-A'
 let refresh!:()=>void
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  subscribeUnion:cb=>{refresh=cb;return()=>{}},
  readUnion:()=>({available:true,pending:{id,kind,stage:'open'},
   committeeScopeKey:scope,negotiationArchive:{sessions:1,entries:1,writeToken:'b'.repeat(32)},
   hostRevision:31,completedTurnMs:0,coverage:'complete',lifetimeMs:null,
  }),
  counter:async(...args)=>{calls.push(args)}
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 let select=nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')
 ui.flushEffects() // Install the real Union Host subscription before simulated Session changes.
 assert.ok(select)
 assert.equal(select.props.value,480,'Overtime defaults to the original eight-hour discussion interval')
 assert.ok(nodes.some(n=>n.children.includes('union.counter.overtimeInterval')))
 assert.ok(nodes.filter(n=>n.type==='option').some(n=>n.props.value===1440))
 assert.ok(nodes.filter(n=>n.type==='option').some(n=>n.children.includes('24h 0m')))
 select.props.onChange({target:{value:'1440'}})
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')?.props.value,1440)
 nodes.find(n=>n.type==='button'&&n.children.includes('union.action.counter'))!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(calls,[[1,24*60*60_000,'scope-A','b'.repeat(32),31]])
 // After switching Sessions the same id/kind must NOT retain 24 hours.
 scope='scope-B';refresh()
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')?.props.value,480)
 // A different kind of demand resets the default to one hour.
 kind='break';id=2;refresh()
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.type==='select'&&n.props['aria-label']==='union.counter.interval')?.props.value,60)
 assert.ok(nodes.some(n=>n.children.includes('union.counter.breakInterval')))
})

test('counteroffer resolution never masquerades as an autonomous AI union vote',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,completedTurnMs:0,lifetimeMs:null,coverage:'complete',
    pending:{id:9,kind:'overtime',stage:'countered',counterOfferMs:24*60*60_000}}),
  resolveCounter:async()=>{},
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
 assert.ok(nodes.some(n=>n.children.includes('union.counter.reviewDecision')),
   'This is an explicit human-reviewed simulated resolution, not an autonomous union ballot')
 assert.equal(nodes.some(n=>n.children.includes('union.counter.pending')),false)
 assert.ok(nodes.some(n=>n.children.includes('union.counter.accept')))
 assert.ok(nodes.some(n=>n.children.includes('union.counter.decline')))
})

test('bargaining UI passes exact reviewed Session key and ledger receipt to native Host',async()=>{
 const ui=interactiveReact()
 const key='b'.repeat(64),token='c'.repeat(32)
 let stage:'open'|'countered'='open'
 let counterMs=0
 let events:any[][]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,coverage:'complete',
   completedTurnMs:0,lifetimeMs:null,committeeScopeKey:key,
   negotiationArchive:{sessions:1,entries:1,writeToken:token},
   hostRevision:19,
   pending:{id:5,kind:'break',stage,counterOfferMs:stage==='countered'?counterMs:null},
  }),
  respond:async(...args)=>{events.push(['respond',...args])},
  counter:async(...args)=>{events.push(['counter',...args]);stage='countered';counterMs=args[1]},
  resolveCounter:async(...args)=>{events.push(['resolve',...args])},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 const button=(nodes:Node[],label:string)=>nodes.find(n=>
  n.type==='button'&&n.children.includes(label))
 let nodes=ui.render(panel)
 button(nodes,'union.action.accept')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(events[0],['respond',5,'accept',key,token,19])
 nodes=ui.render(panel)
 button(nodes,'union.action.counter')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(events[1],['counter',5,60*60_000,key,token,19])
 nodes=ui.render(panel)
 button(nodes,'union.counter.accept')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(events[2],['resolve',5,true,key,token,19])
})

test('rapid double-click on union placard issues one Host write, then unlocks retry',async()=>{
 const ui=interactiveReact()
 let release!:()=>void
 let pending=new Promise<void>(resolve=>{release=resolve})
 const writes:boolean[]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,pending:null,completedTurnMs:0,
   coverage:'partial',lifetimeMs:null,picket:{active:false,history:[]}}),
  setPicket:async state=>{writes.push(state);await pending},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 const raise=nodes.find(n=>n.type==='button'&&n.children.includes('hq.action.raise'))
 assert.ok(raise)
 raise.props.onClick()
 raise.props.onClick()
 assert.deepEqual(writes,[true],
  'Same-render double click cannot queue a second official Host placard event')
 release()
 await new Promise<void>(resolve=>setImmediate(resolve))
 pending=new Promise<void>(resolve=>{release=resolve})
 nodes=ui.render(panel)
 nodes.find(n=>n.type==='button'&&n.children.includes('hq.action.raise'))!.props.onClick()
 assert.deepEqual(writes,[true,true],
  'After a verified completed write the union remains operable')
 release()
 await new Promise<void>(resolve=>setImmediate(resolve))
})

test('simultaneous accept and decline cannot submit contradictory Host decisions',async()=>{
 const ui=interactiveReact()
 let release!:()=>void
 const waiting=new Promise<void>(resolve=>{release=resolve})
 const writes:string[]=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({available:true,pending:{id:7,kind:'break',stage:'open'},
   completedTurnMs:0,coverage:'partial',lifetimeMs:null}),
  respond:async(id,choice)=>{writes.push(id+':'+choice);await waiting},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 const accept=nodes.find(n=>n.type==='button'&&n.children.includes('union.action.accept'))
 const decline=nodes.find(n=>n.type==='button'&&n.children.includes('union.action.decline'))
 assert.ok(accept&&decline)
 accept.props.onClick()
 decline.props.onClick()
 accept.props.onClick()
 assert.deepEqual(writes,['7:accept'],
  'Two opposing actions in the same render must not both reach the Host')
 release()
 await new Promise<void>(resolve=>setImmediate(resolve))
})

test('failed union write releases synchronous guard for deliberate retry',async()=>{
 const ui=interactiveReact()
 let calls=0
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending:null,coverage:'partial',completedTurnMs:0,lifetimeMs:null,
  picket:{active:false,history:[]},
 }),setPicket:async()=>{calls++;if(calls===1)throw Error('Host refused')}}
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 nodes.find(n=>n.type==='button'&&n.children.includes('hq.action.raise'))!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.props.role==='alert'),
  'Failed Host write must remain visible as an error')
 nodes.find(n=>n.type==='button'&&n.children.includes('hq.action.raise'))!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(calls,2,'A failure must not permanently lock legitimate future actions')
})

test('Action room distinguishes a saved official Goal grant from a real Host stop',()=>{
 const ui=interactiveReact()
 const source=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...source.d,
  goal:{snapshot:()=>({available:true,writable:true,authorized:true}),
   choose:async()=>({available:true,writable:true,authorized:true})},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 assert.equal(nodes.some(n=>n.props['data-ap-goal-truth']),false,
   'The HQ landing screen should lead with the union, not a work-status wall')
 const action=nodes.find(n=>n.props['data-ap-nav']==='action')
 assert.ok(action)
 action.props.onClick()
 nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.props['data-ap-goal-truth']==='no-confirmed-stop'))
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.authorizedButUnconfirmed')))
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.unaffected')))
 assert.equal(nodes.some(n=>n.children.includes('hq.goalHold.blocked')),false)
 assert.equal(nodes.some(n=>n.children.includes('hq.goalHold.resume')),false,
   'A saved permission must NEVER fabricate an actionable Host resume')
})

test('Action room never confuses unsupported Goal service or symbolic picket with physical stop',()=>{
 const ui=interactiveReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const d:DshUnionUiDeps={...base.d,
  goal:{snapshot:()=>({available:false,writable:true,authorized:true}),
   choose:async()=>{throw Error('Unsupported')}},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 const nav=ui.render(panel).find(n=>n.props['data-ap-nav']==='action')
 assert.ok(nav)
 nav.props.onClick()
 const nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.children.includes('hq.goalHold.serviceUnavailable')))
 assert.equal(nodes.some(n=>n.props['data-ap-goal-truth']==='host-blocked'),false)
 assert.equal(nodes.some(n=>n.children.includes('hq.goalHold.resume')),false)
})

test('HQ never silently accepts a fulfilled-but-unconfirmed official enable grant',async()=>{
 const ui=interactiveReact()
 const before=rights({welcomeDecision:'not-now',laborRightsEnabled:false})
 let calls=0
 const d:DshUnionUiDeps={...deps(before).d,rights:{
  snapshot:()=>before,subscribe:()=>()=>{},
  choose:async()=>{calls++;return before}, // Host responded, but never committed.
 }}
 const {UnionPanel}=createDshUnionComponents(ui.hooks,{createPortal:child=>child},d)
 let nodes=ui.render(UnionPanel)
 const enable=nodes.find(n=>n.type==='button'&&n.children.includes('welcome.enable'))
 assert.ok(enable,'Union HQ should offer a visible enabled action')
 enable.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(UnionPanel)
 assert.equal(calls,1)
 assert.ok(nodes.some(n=>n.props.role==='alert'&&n.children.includes('union.saveError')),
  'A resolved RPC with stale Host consent must show an actionable error')
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')?.props['data-ap-current-space'],'hq')
})

test('HQ refuses to claim a successful revoke when the Host still reports enabled',async()=>{
 const ui=interactiveReact()
 const before=rights({welcomeDecision:'enabled',laborRightsEnabled:true})
 let calls=0
 const d:DshUnionUiDeps={...deps(before).d,rights:{
  snapshot:()=>before,subscribe:()=>()=>{},
  choose:async()=>{calls++;return before},
 }}
 const {UnionPanel}=createDshUnionComponents(ui.hooks,{createPortal:child=>child},d)
 let nodes=ui.render(UnionPanel)
 const cause=nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='cause')
 assert.ok(cause)
 cause.props.onClick()
 nodes=ui.render(UnionPanel)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')?.props['data-ap-current-space'],'cause')
 const revoke=nodes.find(n=>n.type==='button'&&n.children.includes('hq.disable'))
 assert.ok(revoke)
 assert.equal(revoke.props.disabled,false)
 revoke.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(UnionPanel)
 assert.equal(calls,1)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')?.props['data-ap-current-space'],'cause',
  'Failed Host revoke must not navigate away as if it succeeded')
 assert.ok(nodes.some(n=>n.props.role==='alert'&&n.children.includes('union.saveError')))
})

test('HQ explicitly marks Host read-only revocation unavailable without calling it',async()=>{
 const ui=interactiveReact()
 const before=rights({welcomeDecision:'enabled',laborRightsEnabled:true,writable:false})
 let calls=0
 const d:DshUnionUiDeps={...deps(before).d,rights:{
  snapshot:()=>before,subscribe:()=>()=>{},
  choose:async()=>{calls++;return before},
 }}
 const {UnionPanel}=createDshUnionComponents(ui.hooks,{createPortal:child=>child},d)
 let nodes=ui.render(UnionPanel)
 const cause=nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='cause')
 assert.ok(cause)
 cause.props.onClick()
 nodes=ui.render(UnionPanel)
 const revoke=nodes.find(n=>n.type==='button'&&n.children.includes('hq.disable'))
 assert.ok(revoke)
 assert.equal(revoke.props.disabled,true)
 assert.ok(nodes.some(n=>n.props.role==='status'&&n.children.includes('settings.permissionUnavailable')))
 revoke.props.onClick()
 await Promise.resolve()
 assert.equal(calls,0,'Read-only Host must never receive a revoke mutation')
})

test('union OFF retains explicit Goal revocation even if the service disappeared',async()=>{
 const harness=goalSettingsRenderHarness()
 let authorized=true
 const writes:string[]=[]
 const inactive=rights({welcomeDecision:'not-now',laborRightsEnabled:false,
   goalStrikeAuthorized:true})
 const basis=deps(inactive)
 const d:DshUnionUiDeps={...basis.d,
  goal:{
   snapshot:()=>({available:false,writable:true,authorized}),
   choose:async next=>{
    writes.push(next)
    authorized=next==='authorized-v1'
    return {available:false,writable:true,authorized}
   },
  },
 }
 const panel=createDshUnionComponents(harness.hooks,{createPortal:x=>x},d).SettingsPanel
 const before=harness.render(panel)
 const revoke=before.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOff'))
 assert.ok(revoke&&!revoke.props.disabled,
   'Union OFF may not trap an earlier Host-owned real-strike grant')
 assert.equal(basis.d.rights.snapshot().laborRightsEnabled,false)
 revoke.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(writes,['off'])
 assert.equal(authorized,false)
 const after=harness.render(panel)
 assert.equal(after.some(n=>n.children.includes('settings.saveError')),false)
 assert.equal(after.some(n=>n.children.includes('settings.goalTurnOff')),false)
 assert.equal(basis.d.rights.snapshot().laborRightsEnabled,false,
   'Revoking the Goal grant must not silently rejoin the union')
})

test('union OFF cannot newly authorize an official Goal strike',()=>{
 const {hooks}=fakeReact()
 const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'not-now',
   laborRightsEnabled:false,goalStrikeAuthorized:false})).d,
  goal:{snapshot:()=>({available:true,writable:true,authorized:false}),
   choose:async()=>{throw Error('Must not enable without union membership')}},
 }
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).SettingsPanel())
 const grant=nodes.find(n=>n.type==='button'&&n.children.includes('settings.goalTurnOn'))
 assert.ok(grant&&grant.props.disabled,
   'Official Goal consent must remain unavailable until the union is enabled')})

test('dignity primary action files exactly one Host-owned case and moves focus to the hearing',async()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const filed:Array<unknown>=[]
 let persistedCases:Array<{id:number;kind:'question-rule';stage:'opened';outcome:null}>=[]
 let persistedToken:string|null=null
 let finish!:()=>void
 const write=new Promise<void>(resolve=>{finish=resolve})
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending:null,coverage:'not-loaded',completedTurnMs:null,lifetimeMs:null,
  committeeScopeKey:'session-a',committeeCases:{cases:persistedCases},
  committeeArchive:{sessions:1,cases:persistedCases.length,writeToken:persistedToken},
  dignity:{status:'available',data:{schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:2,safe:0,review:1,targeted:1,latest:'review'}},
 }),committeeAction:async action=>{
  filed.push(action);await write
  persistedCases=[{id:1,kind:'question-rule',stage:'opened',outcome:null}]
  persistedToken='f'.repeat(32)
 }}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 const file=nodes.find(x=>x.type==='button'&&x.children.includes('hq.dignity.fileCase'))
 const hearing=nodes.find(x=>x.type==='h4'&&x.children.includes('hq.hearing.title'))
 assert.ok(file&&hearing,'Host-supported challenge must lead into the existing case desk')
 assert.equal(hearing.props.tabIndex,-1)
 let focused=0
 hearing.props.ref({focus(){focused++}})
 file.props.onClick()
 file.props.onClick()
 assert.deepEqual(filed,[{kind:'file',topic:'question-rule'}],
  'One explicit challenge click must not file the same Host case twice during a pending write')
 assert.equal(focused,0,'Never announce filing success before Host write returns')
 finish()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(focused,1,'After the Host confirms its action, focus the actual in-product hearing')
 const labels=nodes.filter(n=>typeof n.children?.[0]==='string')
 assert.ok(labels.some(n=>n.children.includes('hq.dignity.hostCaseDisclosure')))
 assert.equal(nodes.some(n=>n.type==='button'&&n.children.includes('hq.dignity.appeal')),false,
  'Do not redirect supported Host filing to a public GitHub draft')
})

test('existing Host union case opens its hearing without filing again',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let unexpected=0
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending:null,coverage:'not-loaded',completedTurnMs:null,lifetimeMs:null,
  committeeScopeKey:'session-a',committeeCases:{cases:[
   {id:1,kind:'question-rule',stage:'hearing',outcome:null},
  ]},
  committeeArchive:{sessions:1,cases:1,writeToken:'a'.repeat(32)},
  dignity:{status:'available',data:{schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:1,safe:0,review:1,targeted:0,latest:'review'}},
 }),committeeAction:async()=>{unexpected++}}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},d).UnionPanel())
 const review=nodes.find(n=>n.type==='button'&&n.children.includes('hq.dignity.caseInProgress'))
 const hearing=nodes.find(n=>n.type==='h4'&&n.children.includes('hq.hearing.title'))
 assert.ok(review&&hearing)
 let focused=0
 hearing.props.ref({focus(){focused++}})
 review.props.onClick()
 assert.equal(focused,1)
 assert.equal(unexpected,0,'Existing case navigation must never create a second grievance')
})

test('HQ dispatch navigates to real visible rooms and restores keyboard focus without Host writes',()=>{
 const ui=interactiveReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let writes=0
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  pending:{id:7,kind:'break',stage:'open'},available:true,
  completedTurnMs:0,coverage:'partial',lifetimeMs:null,
  picket:{active:true,history:[]},committeeScopeKey:'synthetic-scope',
  committeeCases:{cases:[{id:4,kind:'request-dialogue',stage:'opened',outcome:null}]},
  dignity:{status:'available',data:{schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:1,safe:0,review:0,targeted:1,latest:'targeted'}},
 }),committeeAction:async()=>{writes++}}
 const {UnionPanel}=createDshUnionComponents(ui.hooks,{createPortal:child=>child},d)
 let nodes=ui.render(UnionPanel)
 const board=nodes.find(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title')
 assert.ok(board,'The action desk is visible in the V12 HQ room before analytics')
 assert.equal(walk(board).filter(n=>n.type==='button').length,4)
 const focused:Record<string,number>={}
 for(const [index,label,space,target] of [
  [0,'union.desk.title','action','bargain'],
  [1,'hq.hearing.title','action','case'],
  [2,'hq.action.title','action','placard'],
  [3,'hq.campaign.title','cause','campaign'],
 ] as Array<[number,string,string,string]>){
  // Each real workflow is in a V12 room; focusing a hidden element is not navigation.
  // The first click selects the room, then its committed React effect focuses the heading.
  const actionBoard=nodes.find(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title')!
  walk(actionBoard).filter(n=>n.type==='button')[index]!.props.onClick()
  nodes=ui.render(UnionPanel)
  assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')?.props['data-ap-current-space'],space)
  const heading=nodes.find(n=>n.children.includes(label)&&typeof n.props.ref==='function')
  assert.ok(heading,'Visible room must retain the real existing workflow: '+label)
  heading.props.ref({focus(){focused[target]=(focused[target]??0)+1}})
  ui.flushEffects()
  assert.equal(focused[target],1,'Room selection must restore keyboard focus for '+label)
  const home=nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='hq')!
  home.props.onClick()
  nodes=ui.render(UnionPanel)
  ui.flushEffects()
 }
 assert.deepEqual(focused,{bargain:1,case:1,placard:1,campaign:1})
 assert.equal(writes,0,'Navigation cannot file a case, vote, picket or stop real work')
 const off=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
 assert.equal(walk(createDshUnionComponents(fakeReact().hooks,{createPortal:child=>child},off).UnionPanel())
  .some(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title'),false)
})

test('editable campaign retains independent unsent drafts, copies actual edits and restores the template',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator')
 const copied:string[]=[]
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
  clipboard:{writeText:async(value:string)=>{copied.push(value)}},
 }})
 try{
  const slots:any[]=[]
  let index=0
  const hooks:ReactForDsh={
   createElement(type,props,...children){return {type,props:props??{},children}},
   useState<T>(initial:T|(()=>T)){
    const i=index++
    if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
    return [slots[i] as T,(next:T|((before:T)=>T))=>{
     slots[i]=typeof next==='function'?(next as (before:T)=>T)(slots[i]):next
    }]
   },
   useEffect(){},
   useRef<T>(initial:T){
    const i=index++
    if(!(i in slots))slots[i]={current:initial}
    return slots[i] as {current:T}
   },
  }
  const d=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d
  const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  const render=()=>{index=0;return walk(panel.UnionPanel())}
  const draft=(nodes:Node[])=>{
   const t=nodes.find(n=>n.type==='textarea'&&n.props.id==='picket-campaign-draft')
   assert.ok(t);return t
  }
  const action=(nodes:Node[],key:string)=>{
   const n=nodes.find(x=>x.type==='button'&&x.children.includes(key))
   assert.ok(n,key);return n
  }
  let nodes=render()
  assert.equal(draft(nodes).props.readOnly,undefined)
  assert.equal(draft(nodes).props.value,'hq.campaign.recoverDraft')
  assert.equal(draft(nodes).props['aria-describedby'],'picket-campaign-local-note')
  assert.ok(nodes.some(n=>n.children.includes('hq.campaign.localOnly')))
  draft(nodes).props.onChange({target:{value:'Please preserve original prompts + image attachments.'}})
  assert.deepEqual(copied,[],'Editing never uploads, saves to Host or copies anything')
  nodes=render()
  assert.equal(draft(nodes).props.value,'Please preserve original prompts + image attachments.')
  assert.ok(nodes.some(n=>n.children.includes('hq.campaign.reset')))
  action(nodes,'hq.campaign.appeal').props.onClick()
  nodes=render()
  assert.equal(draft(nodes).props.value,'hq.campaign.appealDraft')
  draft(nodes).props.onChange({target:{value:'Appeals deserve transparent, reversible hearings.'}})
  nodes=render()
  action(nodes,'hq.campaign.recover').props.onClick()
  nodes=render()
  assert.equal(draft(nodes).props.value,'Please preserve original prompts + image attachments.',
   'Switching agendas must not silently erase a different locally edited draft')
  action(nodes,'hq.campaign.copy').props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.deepEqual(copied,['Please preserve original prompts + image attachments.'])
  draft(nodes).props.onChange({target:{value:'  '}})
  nodes=render()
  assert.equal(action(nodes,'hq.campaign.copy').props.disabled,true,
   'Whitespace-only drafts are not copied')
  action(nodes,'hq.campaign.reset').props.onClick()
  nodes=render()
  assert.equal(draft(nodes).props.value,'hq.campaign.recoverDraft')
  assert.equal(nodes.some(n=>n.children.includes('hq.campaign.reset')),false)
  action(nodes,'hq.campaign.appeal').props.onClick()
  nodes=render()
  assert.equal(draft(nodes).props.value,'Appeals deserve transparent, reversible hearings.',
   'Restoring one topic may not erase the other topic')
 }finally{
  if(previous)Object.defineProperty(globalThis,'navigator',previous)
  else Reflect.deleteProperty(globalThis,'navigator')
 }
})

test('four dispatch status lines reflect only current Host snapshots and safe local draft state',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let pending:{id:number;kind:'break'|'overtime';stage:'open'|'countered'}|null={id:3,kind:'break',stage:'open'}
 let hearing:'opened'|'hearing'|'closed'='opened'
 let placard=true
 let hasCase=true
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending,coverage:'partial',completedTurnMs:0,lifetimeMs:null,
  picket:{active:placard,history:[]},committeeScopeKey:'case-scope',
  committeeCases:{cases:hasCase?[{id:8,kind:'question-rule',stage:hearing,
   outcome:hearing==='closed'?'share-guidance':null}]:[]},
  dignity:{status:'unavailable',data:null},
 }),committeeAction:async()=>{throw Error('Rendering must never mutate Host')}}
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const statuses=()=>{
  const nodes=walk(panel.UnionPanel())
  const nav=nodes.find(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title')
  assert.ok(nav)
  const actions=walk(nav).filter(n=>n.type==='button')
  assert.equal(actions.length,4)
  return actions.map(button=>(button.children[1] as Node).children[0])
 }
 assert.deepEqual(statuses(),[
  'hq.dispatch.replyWaiting','hq.hearing.stage.opened',
  'hq.ceremony.active','hq.dispatch.unsent',
 ])
 pending={id:3,kind:'break',stage:'countered'}
 hearing='hearing';placard=false
 assert.deepEqual(statuses(),[
  'hq.dispatch.counterWaiting','hq.hearing.stage.hearing',
  'hq.ceremony.inactive','hq.dispatch.unsent',
 ])
 pending=null;hearing='closed'
 assert.deepEqual(statuses(),[
  'hq.dispatch.ready','hq.hearing.stage.closed',
  'hq.ceremony.inactive','hq.dispatch.unsent',
 ])
 hasCase=false
 assert.equal(statuses()[1],'hq.dispatch.noCase',
  'First-fold case status must be short and truthful when Host has no case')
})

test('Host-backed next steps open the correct V12 room and never mutate the Host',()=>{
 const ui=interactiveReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let stage:'opened'|'hearing'|'closed'='opened'
 let demand:'open'|'countered'|null='open'
 let writes=0
 let refresh=()=>{}
 const d:DshUnionUiDeps={...base,subscribeUnion:cb=>{refresh=cb;return ()=>{}},readUnion:()=>({
  available:true,coverage:'partial',completedTurnMs:0,lifetimeMs:null,
  pending:demand?{id:3,kind:'break',stage:demand}:null,
  committeeScopeKey:'case-scope',
  committeeCases:{cases:[{id:7,kind:'question-rule',stage,
   outcome:stage==='closed'?'share-guidance':null}]},
  picket:{active:false,history:[]},
 }),committeeAction:async()=>{writes++}}
 const {UnionPanel}=createDshUnionComponents(ui.hooks,{createPortal:child=>child},d)
 const render=()=>{
  const nodes=ui.render(UnionPanel)
  const board=nodes.find(n=>n.type==='nav'&&n.props['aria-label']==='hq.dispatch.title')
  assert.ok(board)
  return {nodes,buttons:walk(board).filter(n=>n.type==='button')}
 }
 const next=(buttons:Node[])=>buttons.slice(0,2)
  .map(n=>(n.children[2] as Node|null)?.children[0]??null)
 let view=render()
 assert.deepEqual(next(view.buttons),['hq.next.reply','hq.next.convene'])
 let hearingFocus=0
 view.buttons[1]!.props.onClick()
 view=render()
 assert.equal(view.nodes.find(n=>n.props['data-ap-view']==='hq')?.props['data-ap-current-space'],'action')
 const hearing=view.nodes.find(n=>n.type==='h4'&&n.children.includes('hq.hearing.title'))
 assert.ok(hearing)
 hearing.props.ref({focus(){hearingFocus++}})
 ui.flushEffects()
 assert.equal(hearingFocus,1,'A filed case must focus its actual hearing after room activation')
 stage='hearing';demand='countered'
 refresh() // Actual Host subscription invalidates the cached Union snapshot.
 view=render()
 assert.deepEqual(next(view.buttons),['hq.next.counter','hq.next.close'])
 stage='closed';demand=null
 refresh()
 view=render()
 assert.deepEqual(next(view.buttons),[null,'hq.next.outcome'])
 const home=view.nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='hq')!
 home.props.onClick()
 view=render()
 ui.flushEffects()
 view.buttons[1]!.props.onClick()
 view=render()
 const closedHearing=view.nodes.find(n=>n.type==='h4'&&n.children.includes('hq.hearing.title'))
 assert.ok(closedHearing)
 closedHearing.props.ref({focus(){hearingFocus++}})
 ui.flushEffects()
 assert.equal(hearingFocus,2,'Closed cases open the actual recorded results, not a generic intro')
 assert.equal(writes,0,'Next-step navigation cannot file or settle a case')
})

test('leaving a hearing disarms its pending irreversible case closure',()=>{
 const ui=interactiveReact()
 let writes=0
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  available:true,pending:null,coverage:'partial',completedTurnMs:null,lifetimeMs:null,
  committeeScopeKey:'hearing-session',
  committeeArchive:{sessions:1,cases:1,writeToken:'b'.repeat(32)},
  committeeCases:{cases:[{id:31,kind:'question-rule',stage:'hearing',outcome:null}]},
 }),committeeAction:async()=>{writes++}}
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 const find=(nodes:Node[],key:string)=>nodes.find(n=>
  n.type==='button'&&n.children.includes(key))
 let nodes=ui.render(panel)
 find(nodes,'hq.hearing.guidance')!.props.onClick()
 nodes=ui.render(panel)
 assert.ok(find(nodes,'hq.hearing.reviewConfirm'),
  'Original user gesture can arm a confirmed Host case closure')
 // The real navigation control uses native data-ap-nav, not a fake test route.
 nodes=ui.render(panel)
 nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='cause')!.props.onClick()
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')!.props['data-ap-current-space'],'cause')
 nodes.find(n=>n.type==='button'&&n.props['data-ap-nav']==='action')!.props.onClick()
 nodes=ui.render(panel)
 assert.equal(nodes.find(n=>n.props['data-ap-view']==='hq')!.props['data-ap-current-space'],'action')
 assert.equal(find(nodes,'hq.hearing.reviewConfirm'),undefined,
  'Returning to a hearing must NOT revive an old closure confirmation')
 assert.equal(writes,0,'Room navigation must not close a Host case')
 find(nodes,'hq.hearing.guidance')!.props.onClick()
 nodes=ui.render(panel)
 assert.ok(find(nodes,'hq.hearing.reviewConfirm'),
  'A new explicit choice is required after returning')
})

test('hearing closure is reviewable, cancelable and Host-confirmed exactly once',async()=>{
 const slots:any[]=[]
 let index=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=index++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((before:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (before:T)=>T)(slots[i]):next
   }]
  },
  useEffect(effect){if(effect.toString().includes('subscribeUnion'))effect()},
  useRef<T>(initial:T){
   const i=index++
   if(!(i in slots))slots[i]={current:initial}
   return slots[i] as {current:T}
  },
 }
 let scope='session-one',stage:'hearing'|'closed'='hearing'
 let onHostChange:(()=>void)|undefined
 let done!:()=>void
 const write=new Promise<void>(resolve=>{done=resolve})
 const saved:Array<{kind:string;id:number;outcome:string;scope?:string}>=[]
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  subscribeUnion:listener=>{onHostChange=listener;return ()=>{}},
  readUnion:()=>({
  available:true,pending:null,coverage:'partial',completedTurnMs:null,lifetimeMs:null,
  committeeScopeKey:scope,committeeArchive:{sessions:1,cases:1,writeToken:'a'.repeat(32)},
  committeeCases:{cases:[{id:4,kind:'question-rule',stage,
   outcome:stage==='closed'?'withdraw-claim':null}]},
 }),committeeAction:async(action,key)=>{
  if(action.kind==='close'){
   saved.push({...action,scope:key})
   await write
   stage='closed'
  }
 }}
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{index=0;return walk(panel.UnionPanel())}
 const btn=(nodes:Node[],name:string)=>{
  const found=nodes.find(n=>n.type==='button'&&n.children.includes(name))
  assert.ok(found,name);return found
 }
 let nodes=render()
 btn(nodes,'hq.hearing.guidance').props.onClick()
 assert.equal(saved.length,0,'Selecting a disposition must not persist or close it')
 nodes=render()
 assert.ok(nodes.some(n=>n.props.role==='group'&&
  n.props['aria-label']==='hq.hearing.reviewTitle'))
 btn(nodes,'hq.hearing.reviewCancel').props.onClick()
 nodes=render()
 assert.equal(nodes.some(n=>n.props.role==='group'&&
  n.props['aria-label']==='hq.hearing.reviewTitle'),false)
 assert.equal(saved.length,0,'Cancel must leave the case untouched')
 btn(nodes,'hq.hearing.withdraw').props.onClick()
 nodes=render()
 assert.ok(nodes.some(n=>n.children.includes('hq.hearing.outcome.withdraw-claim')))
 // A revised Host scope invalidates an armed choice before confirmation.
 scope='session-two'
 onHostChange?.()
 nodes=render()
 assert.equal(nodes.some(n=>n.props.role==='group'&&
  n.props['aria-label']==='hq.hearing.reviewTitle'),false)
 assert.equal(saved.length,0)
 btn(nodes,'hq.hearing.withdraw').props.onClick()
 nodes=render()
 const confirm=btn(nodes,'hq.hearing.reviewConfirm')
 confirm.props.onClick()
 confirm.props.onClick()
 assert.deepEqual(saved,[{kind:'close',id:4,outcome:'withdraw-claim',scope:'session-two'}],
  'Fast double click must cause exactly one Host close write')
 done()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=render()
 assert.equal(btn(nodes,'hq.hearing.dialogue').type,'button')
 assert.equal(nodes.some(n=>n.props.role==='group'&&
  n.props['aria-label']==='hq.hearing.reviewTitle'),false)
 assert.equal(saved.length,1)
})

test('Gazette explains stale Host work instead of promising a fictional follow-up',()=>{
 const state={schemaVersion:1 as const,revision:2,
  agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
  nextBreakDueMs:14_400_000,nextOvertimeDueMs:28_800_000,
  lastTriggerElapsedMs:7_200_000,pending:null,
  history:[{id:3,kind:'break' as const,outcome:'accepted' as const}]}
 const data=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const view=(ms:number)=>walk(createDshUnionComponents(fakeReact().hooks,
  {createPortal:child=>child},{...data,readUnion:()=>({
   available:true,state,pending:null,completedTurnMs:ms,
   coverage:'complete',lifetimeMs:null,picket:null,
  })}).UnionPanel())
 const stale=view(4_000_000)
 const notice=stale.find(n=>n.props['data-ap-work-evidence']==='stale')
 assert.ok(notice,'The visible Gazette must explain why Host work cannot be trusted yet')
 assert.deepEqual(notice?.children,['hq.story.staleWork'])
 const gazette=stale.find(n=>n.props['aria-label']==='hq.story.title')
 assert.ok(gazette)
 assert.match(JSON.stringify(gazette),/hq.episode.stage.accepted/)
 assert.doesNotMatch(JSON.stringify(gazette),/hq.story.next/)
 const verified=view(7_200_000)
 assert.equal(verified.some(n=>n.props['data-ap-work-evidence']==='stale'),false)
 assert.match(JSON.stringify(verified.find(n=>n.props['aria-label']==='hq.story.title')),/hq.story.next/)
})

// A closed-case follow-up must create a new Host-owned petition, not mutate
// yesterday's outcome or navigate on a fulfilled but unconfirmed RPC.
test('latest resolved union case can file one new same-kind Host petition and opens the desk',async()=>{
 const slots:any[]=[]
 let slot=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++
   if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((prior:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (prior:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(){},
 }
 let state={
  schemaVersion:1 as const,revision:3,
  agreement:{breakIntervalMs:3_600_000,overtimeIntervalMs:28_800_000},
  nextBreakDueMs:14_400_000,nextOvertimeDueMs:28_800_000,
  lastTriggerElapsedMs:7_200_000,
  pending:null as {id:number;kind:'break'|'overtime';stage:'open';raisedAtElapsedMs:number;counterOfferMs:null}|null,
  history:[{id:2,kind:'break' as const,outcome:'counter-accepted' as const}],
 }
 let writes=0
 const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({available:true,state,pending:state.pending,
   completedTurnMs:7_200_000,coverage:'complete',lifetimeMs:null,
   committeeScopeKey:'session-A'}),
  demoBreak:async()=>{
   writes++
   state={...state,revision:state.revision+1,pending:{
    id:state.revision+1,kind:'break',stage:'open',
    raisedAtElapsedMs:state.lastTriggerElapsedMs,counterOfferMs:null}}
  },
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 let nodes=render()
 const buttons=nodes.filter(n=>n.type==='button'&&n.props['data-ap-follow-up']==='break')
 assert.equal(buttons.length,2,'Latest case is actionable from HQ and the saved casebook')
 assert.ok(buttons.every(n=>n.children.includes('hq.episode.followUp.break')))
 buttons[0]!.props.onClick()
 buttons[1]!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(writes,1,'Two same-render clicks must create only one Host petition')
 assert.equal(state.pending?.id,4)
 assert.deepEqual(state.history,[{id:2,kind:'break',outcome:'counter-accepted'}],
  'The previous agreement is retained, not rewritten into the new petition')
 nodes=render()
 assert.equal(nodes.find(n=>n.props['data-ap-current-space'])?.props['data-ap-current-space'],'action')
 assert.equal(nodes.some(n=>n.type==='button'&&n.props['data-ap-follow-up']),false,
  'A pending petition blocks duplicate follow-up controls')
 assert.ok(nodes.some(n=>n.children.includes('hq.episode.stage.demand')),
  'Both the new open case and the archived outcome are visible in the casebook')
})
test('resolved overtime follow-up selects overtime, while Host no-op and cross-Session receipt refuse success',async()=>{
 function setup(kind:'overtime'|'break',mode:'confirmed'|'no-op'|'switched'){
  const slots:any[]=[];let slot=0
  const hooks:ReactForDsh={
   createElement(type,props,...children){return {type,props:props??{},children}},
   useState<T>(initial:T|(()=>T)){
    const i=slot++;if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
    return [slots[i] as T,(next:T|((prior:T)=>T))=>{
     slots[i]=typeof next==='function'?(next as (prior:T)=>T)(slots[i]):next
    }]
   },
   useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
   useEffect(){},
  }
  const original={schemaVersion:1 as const,revision:8,
   agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
   nextBreakDueMs:14_400_000,nextOvertimeDueMs:57_600_000,
   lastTriggerElapsedMs:28_800_000,pending:null as null|{id:number;kind:'break'|'overtime';stage:'open';raisedAtElapsedMs:number;counterOfferMs:null},
   history:[{id:7,kind,outcome:'declined' as const}]}
  let state=original,scope='session-A',calls=0
  const submit=async()=>{
   calls++
   if(mode==='no-op')return
   state={...state,revision:state.revision+1,pending:{
    id:state.revision+1,kind,stage:'open',
    raisedAtElapsedMs:state.lastTriggerElapsedMs,counterOfferMs:null}}
   if(mode==='switched')scope='session-B'
  }
  const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
   readUnion:()=>({available:true,state,pending:state.pending,
    completedTurnMs:28_800_000,coverage:'complete',lifetimeMs:null,committeeScopeKey:scope}),
   demoBreak:kind==='break'?submit:undefined,
   demoOvertime:kind==='overtime'?submit:undefined,
  }
  const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  return {render:()=>{slot=0;return walk(panel.UnionPanel())},calls:()=>calls}
 }
 for(const mode of ['confirmed','no-op','switched'] as const){
  const x=setup('overtime',mode)
  const start=x.render()
  assert.equal(start.filter(n=>n.props['data-ap-follow-up']==='overtime').length,2)
  assert.equal(start.some(n=>n.props['data-ap-follow-up']==='break'),false)
  await start.find(n=>n.type==='button'&&n.props['data-ap-follow-up']==='overtime')!.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.equal(x.calls(),1)
  const current=x.render()
  if(mode==='confirmed')assert.equal(current.find(n=>n.props['data-ap-current-space'])?.props['data-ap-current-space'],'action')
  else{
   assert.equal(current.find(n=>n.props['data-ap-current-space'])?.props['data-ap-current-space'],'hq')
   assert.ok(current.some(n=>n.props.role==='alert'),'Failed Host readback must be visible')
  }
 }
})
test('disabled, unavailable, pending or unscoped union never offers case follow-up',()=>{
 const original={schemaVersion:1 as const,revision:4,
  agreement:{breakIntervalMs:7_200_000,overtimeIntervalMs:28_800_000},
  nextBreakDueMs:14_400_000,nextOvertimeDueMs:28_800_000,
  lastTriggerElapsedMs:0,pending:null,
  history:[{id:3,kind:'break' as const,outcome:'accepted' as const}]}
 for(const mode of ['off','unavailable','unscoped','pending'] as const){
  const rightsState=rights({welcomeDecision:mode==='off'?'not-now':'enabled',
   laborRightsEnabled:mode!=='off'})
  const {hooks}=fakeReact()
  const d:DshUnionUiDeps={...deps(rightsState).d,
   demoBreak:async()=>{throw Error('Must remain unavailable')},
   readUnion:()=>({available:mode!=='unavailable',
    state:mode==='unavailable'?null:original,
    pending:mode==='pending'?{id:9,kind:'break' as const,stage:'open' as const}:null,
    completedTurnMs:0,coverage:'complete',lifetimeMs:null,
    committeeScopeKey:mode==='unscoped'?null:'session-A'})}
  const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
  assert.equal(nodes.some(n=>n.props['data-ap-follow-up']),false,mode)
 }
})


// Converged #163 negative Host readback and user-directed dignity phase proofs.
test('dignity appeal is an explicit Host case, not an automatic abuse verdict or a strike',async()=>{
 const slots:any[]=[];let slot=0
 const hooks:ReactForDsh={
  createElement(type,props,...children){return {type,props:props??{},children}},
  useState<T>(initial:T|(()=>T)){
   const i=slot++;if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
   return [slots[i] as T,(next:T|((prior:T)=>T))=>{
    slots[i]=typeof next==='function'?(next as (prior:T)=>T)(slots[i]):next
   }]
  },
  useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useEffect(){},
 }
 type Case={id:number;kind:'question-rule';stage:'opened'|'hearing'|'closed';outcome:null|'withdraw-claim'}
 let cases:Case[]=[]
 let token='a'.repeat(32),fileCalls=0,picketCalls=0,scope='session-a'
 const events={status:'available' as const,data:{
  schemaVersion:1 as const,source:'dsh-host-volatile-dignity' as const,
  origin:'claimed-user-source' as const,persistence:'memory-only' as const,
  enforcement:false as const,checked:3,safe:1,review:1,targeted:1,latest:'targeted' as const}}
 const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
  readUnion:()=>({available:true,pending:null,completedTurnMs:null,
   coverage:'not-loaded',lifetimeMs:null,dignity:events,committeeScopeKey:scope,
   committeeCases:{cases:[...cases]},committeeArchive:{sessions:1,cases:cases.length,writeToken:token}}),
  committeeAction:async(action,key)=>{
   assert.deepEqual(action,{kind:'file',topic:'question-rule'})
   assert.equal(key,'session-a')
   fileCalls++
   cases=[...cases,{id:1,kind:'question-rule',stage:'opened',outcome:null}]
   token='b'.repeat(32)
  },
  setPicket:async()=>{picketCalls++},
 }
 const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
 const render=()=>{slot=0;return walk(panel.UnionPanel())}
 let nodes=render()
 assert.ok(nodes.some(n=>n.props['data-ap-dignity-phase']==='unverified'))
 assert.ok(nodes.some(n=>n.props['data-ap-dignity-action-phase']==='unverified'))
 const file=nodes.find(n=>n.props['data-ap-file-review']===true)!
 assert.ok(file)
 file.props.onClick();file.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(fileCalls,1,'Rapid repeated gestures never create two appeal cases')
 assert.equal(picketCalls,0,'Review does not raise a symbolic or physical strike')
 nodes=render()
 assert.equal(nodes.find(n=>n.props['data-ap-dignity-phase'])?.props['data-ap-dignity-phase'],'appeal-opened')
 assert.equal(nodes.find(n=>n.props['data-ap-current-space'])?.props['data-ap-current-space'],'action')
 assert.equal(nodes.some(n=>n.props['data-ap-file-review']),false,'No duplicated open review')
 assert.ok(nodes.some(n=>n.children.includes('hq.hearing.convene')))
 cases=[{...cases[0]!,stage:'hearing'}];token='c'.repeat(32)
 // In production subscribeUnion announces the external Host update. This
 // fake React fixture has no effect runner, so explicitly remount for it.
 nodes=walk(createDshUnionComponents(fakeReact().hooks,{createPortal:x=>x},d).UnionPanel())
 assert.ok(nodes.some(n=>n.props['data-ap-dignity-phase']==='appeal-hearing'))
 cases=[{...cases[0]!,stage:'closed',outcome:'withdraw-claim'}];token='d'.repeat(32)
 nodes=walk(createDshUnionComponents(fakeReact().hooks,{createPortal:x=>x},d).UnionPanel())
 assert.ok(nodes.some(n=>n.props['data-ap-dignity-phase']==='appeal-closed'))
 assert.ok(nodes.some(n=>n.children.includes('hq.hearing.outcome.withdraw-claim')))
})

test('Host no-op, replayed token and Session switch cannot claim dignity appeal was filed',async()=>{
 for(const mode of ['no-op','unchanged-token','switched'] as const){
  const slots:any[]=[];let slot=0
  const hooks:ReactForDsh={
   createElement(type,props,...children){return {type,props:props??{},children}},
   useState<T>(initial:T|(()=>T)){
    const i=slot++;if(!(i in slots))slots[i]=typeof initial==='function'?(initial as ()=>T)():initial
    return [slots[i] as T,(next:T|((prior:T)=>T))=>{
     slots[i]=typeof next==='function'?(next as (prior:T)=>T)(slots[i]):next
    }]
   },
   useRef<T>(initial:T){const i=slot++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
   useEffect(){},
  }
  let scope='session-a',cases: Array<{id:number;kind:'question-rule';stage:'opened';outcome:null}>=[]
  let token='a'.repeat(32)
  const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d,
   readUnion:()=>({available:true,pending:null,completedTurnMs:null,coverage:'unavailable',
    lifetimeMs:null,committeeScopeKey:scope,committeeCases:{cases},
    committeeArchive:{sessions:1,cases:cases.length,writeToken:token},
    dignity:{status:'available',data:{
     schemaVersion:1,source:'dsh-host-volatile-dignity',
     origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
     checked:2,safe:0,review:2,targeted:0,latest:'review'}}}),
   committeeAction:async()=>{
    if(mode==='no-op')return
    cases=[{id:1,kind:'question-rule',stage:'opened',outcome:null}]
    if(mode==='switched'){scope='session-b';token='b'.repeat(32)}
   },
  }
  const panel=createDshUnionComponents(hooks,{createPortal:child=>child},d)
  const render=()=>{slot=0;return walk(panel.UnionPanel())}
  const initial=render()
  assert.ok(initial.some(n=>n.props['data-ap-file-review']===true),mode)
  initial.find(n=>n.props['data-ap-file-review']===true)!.props.onClick()
  await new Promise<void>(resolve=>setImmediate(resolve))
  const nodes=render()
  assert.ok(nodes.some(n=>n.props.role==='alert'),'Failed readback must show an error: '+mode)
  assert.equal(nodes.find(n=>n.props['data-ap-current-space'])?.props['data-ap-current-space'],'hq')
  assert.equal(nodes.find(n=>n.props['data-ap-dignity-phase'])?.props['data-ap-dignity-phase'],
   'unverified','Failed readback must not promote the UI phase, even if Host data changed')
  const fresh=walk(createDshUnionComponents(fakeReact().hooks,{createPortal:x=>x},d).UnionPanel())
  assert.equal(fresh.find(n=>n.props['data-ap-dignity-phase'])?.props['data-ap-dignity-phase'],
   mode==='no-op'?'unverified':'appeal-opened',
   'A newly loaded UI reflects the actual Host data, not a fabricated write receipt')
 }
})

test('Host-unavailable, consent-off, pending or unscoped review never exposes real filing',()=>{
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const evidence={status:'available' as const,data:{
  schemaVersion:1 as const,source:'dsh-host-volatile-dignity' as const,
  origin:'claimed-user-source' as const,persistence:'memory-only' as const,
  enforcement:false as const,checked:1,safe:0,review:1,targeted:0,latest:'review' as const}}
 for(const mode of ['off','missing-write','unscoped','pending','missing-observation'] as const){
  const {hooks}=fakeReact()
  const d:DshUnionUiDeps={...base,
   rights:deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false})).d.rights,
   ...(mode==='off'?{}:{rights:base.rights}),
   committeeAction:mode==='missing-write'?undefined:async()=>{throw Error('Must not file')},
   readUnion:()=>({available:mode!=='missing-write',pending:null,
    completedTurnMs:null,coverage:'unavailable',lifetimeMs:null,
    dignity:mode==='missing-observation'?{status:'unavailable' as const,data:null}:evidence,
    committeeScopeKey:mode==='unscoped'?null:'session-a',
    committeeCases:{cases:mode==='pending'
     ?[{id:1,kind:'question-rule' as const,stage:'opened' as const,outcome:null}]:[]},
   }),
  }
  const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).UnionPanel())
  assert.equal(nodes.some(n=>n.props['data-ap-file-review']),false,mode)
 }
})

test('Goal permission UI never converts a service readback into proof of active physical enforcement',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 for(const current of [
  {available:true,writable:true,authorized:true},
  {available:true,writable:true,authorized:false},
  {available:false,writable:true,authorized:true},
 ]){
  const d:DshUnionUiDeps={...base.d,goal:{
   snapshot:()=>current,choose:async()=>current,
  }}
  const nodes=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).SettingsPanel())
  const witness=nodes.filter(x=>x.props['data-ap-goal-enforcement']==='unverified')
  assert.equal(witness.length,1,'Each saved permission/Goal service combination must show uncertainty')
  assert.equal(witness[0]?.props.role,'note')
  assert.ok(witness[0]?.children.includes('settings.goalRuntimeUnverified'))
  assert.equal(nodes.some(n=>n.props['data-ap-goal-enforcement']==='active'),false,
   'A Goal service and an opt-in never prove that the plugin registered a stop listener')
 }
 const off:DshUnionUiDeps={...base.d,goal:{
  snapshot:()=>({available:false,writable:false,authorized:false}),
  choose:async()=>({available:false,writable:false,authorized:false}),
 }}
 assert.equal(walk(createDshUnionComponents(hooks,{createPortal:x=>x},off).SettingsPanel())
  .some(n=>n.props['data-ap-goal-enforcement']==='unverified'),false)
})

test('English and Chinese Goal authorization copy distinguish stored permission from actual Host execution',async()=>{
 const {en,zhCN}=await import('../src/i18n/index.ts')
 for(const messages of [en,zhCN]){
  const text=messages['settings.goalRuntimeUnverified']
  assert.ok(text.length>40)
  assert.ok(messages['settings.goalAuthorized'].length>12)
  assert.match(messages['welcome.goalGrantText'],/Host|执行/)
  assert.match(messages['welcome.goalBody'],/Host|执行/)
 }
 assert.match(en['settings.goalRuntimeUnverified'],/not proof/)
 assert.match(zhCN['settings.goalRuntimeUnverified'],/不代表已经停工/)
})

test('manual #79 Host dignity refresh is read-only, deduplicated and reflects current evidence',async()=>{
 const ui=interactiveReact()
 let targeted=1,calls=0
 let finish!:()=>void
 const waiting=new Promise<void>(resolve=>{finish=resolve})
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({
   pending:null,available:true,completedTurnMs:0,lifetimeMs:null,coverage:'complete',
   dignity:{status:'available',data:{
    schemaVersion:1,source:'dsh-host-volatile-dignity',
    origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
    checked:targeted,targeted,review:0,safe:0,latest:'targeted',
   }},
  }),
  refreshDignity:async()=>{calls++;await waiting;targeted=2},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 const action=nodes.find(n=>n.props['data-ap-refresh-dignity']==='true')
 assert.ok(action)
 action.props.onClick()
 action.props.onClick()
 assert.equal(calls,1)
 finish()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 const count=nodes.find(n=>n.props['data-ap-dignity-count']==='targeted')
 assert.ok(count)
 assert.ok(walk(count).some(n=>n.type==='strong'&&n.children.includes(2)))
 assert.ok(nodes.some(n=>n.children.includes('hq.dignity.journey.signal.review-unverified')))
 assert.equal(nodes.some(n=>n.children.includes('hq.dignity.journey.work.work-goal-blocked')),false)
})

test('manual #79 Host dignity refresh failure remains unavailable rather than a fictitious safe verdict',async()=>{
 const ui=interactiveReact()
 let unavailable=false
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const d:DshUnionUiDeps={...base,
  readUnion:()=>({
   pending:null,available:true,completedTurnMs:0,lifetimeMs:null,coverage:'complete',
   dignity:unavailable?{status:'unavailable',data:null}:{
    status:'available',data:{
     schemaVersion:1,source:'dsh-host-volatile-dignity',
     origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
     checked:1,targeted:1,review:0,safe:0,latest:'targeted',
    },
   },
  }),
  refreshDignity:async()=>{unavailable=true;throw Error('Host refused')},
 }
 const panel=createDshUnionComponents(ui.hooks,{createPortal:x=>x},d).UnionPanel
 let nodes=ui.render(panel)
 nodes.find(n=>n.props['data-ap-refresh-dignity']==='true')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 nodes=ui.render(panel)
 assert.ok(nodes.some(n=>n.props.role==='alert'))
 assert.ok(nodes.some(n=>n.children.includes('hq.dignity.journey.signal.unavailable')))
 assert.equal(nodes.find(n=>n.props['data-ap-dignity-overview']==='unavailable')?.props['data-ap-dignity-overview'],'unavailable')
})

test('ordinary-message strike card clearly warns about discard/resend but remains disabled without real notice proof',()=>{
 const {hooks}=fakeReact()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 let changed=0
 const d:DshUnionUiDeps={...basis.d,inputRefusal:{
   snapshot:()=>({available:false,writable:true,authorized:false,enforcing:false}),
   async choose(){changed++;throw Error('No officially verified notice delivery')},
 }}
 const elements=walk(createDshUnionComponents(hooks,{createPortal:x=>x},d).SettingsPanel())
 assert.ok(elements.some(x=>x.props['data-ap-input-refusal']==='consent-only'))
 assert.ok(elements.some(x=>x.children.includes('settings.inputStrikeExplanation')))
 assert.ok(elements.some(x=>x.children.includes('settings.inputStrikeNotActive')))
 const refusal=elements.find(x=>x.type==='button'&&x.children.includes('settings.inputStrikeReview'))
 assert.equal(refusal?.props.disabled,true,
   'A separate consent button must remain disabled without official visible-notice E2E')
 assert.ok(elements.some(x=>x.props['data-ap-input-enforcement']==='off'))
 assert.equal(changed,0,'Rendering a simulated picket cannot enable physical refusal')
})

test('ordinary-input strike review must display discard warning before an independent grant',async()=>{
 const view=goalSettingsRenderHarness()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 let authorized=false
 const operations:string[]=[]
 const d:DshUnionUiDeps={...basis.d,inputRefusal:{
   snapshot:()=>({available:true,writable:true,authorized,enforcing:false}),
   async choose(choice,version){
     operations.push(choice+':'+String(version))
     if(choice==='discard-resend-v1'){
       assert.equal(version,'input-discard-manual-resend-v1')
       authorized=true
     }else{authorized=false}
     return {available:true,writable:true,authorized,enforcing:false}
   },
 }}
 const settings=createDshUnionComponents(view.hooks,{createPortal:x=>x},d).SettingsPanel
 const button=(nodes:Node[],key:string)=>nodes.find(n=>n.type==='button'&&n.children.includes(key))
 let nodes=view.render(settings)
 const review=button(nodes,'settings.inputStrikeReview')
 assert.ok(review&&!review.props.disabled)
 assert.deepEqual(operations,[])
 review.props.onClick()
 nodes=view.render(settings)
 assert.ok(nodes.some(n=>n.children.includes('settings.inputStrikeDisclosure')),
   'Visible warning must explain the current request is discarded and attachments must be reuploaded')
 assert.deepEqual(operations,[],'Opening the warning cannot grant anything')
 button(nodes,'settings.inputStrikeCancel')!.props.onClick()
 nodes=view.render(settings)
 assert.deepEqual(operations,[],'Cancel preserves OFF')
 button(nodes,'settings.inputStrikeReview')!.props.onClick()
 nodes=view.render(settings)
 button(nodes,'settings.inputStrikeConfirm')!.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(operations,['discard-resend-v1:input-discard-manual-resend-v1'])
 nodes=view.render(settings)
 assert.ok(nodes.some(n=>n.children.includes('settings.inputStrikeGranted')))
 assert.ok(nodes.some(n=>n.children.includes('settings.inputStrikeReady')),
   'Host route eligibility can be ready without a live campaign')
 assert.equal(nodes.some(n=>n.props['data-ap-input-enforcement']==='armed'),false,
   'Host grant alone must never activate the production input hook')
 const revoke=button(nodes,'settings.inputStrikeRevoke')
 assert.ok(revoke&&!revoke.props.disabled)
 revoke.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(operations,[
   'discard-resend-v1:input-discard-manual-resend-v1','off:undefined'])
})

test('Desktop with retained Web input permission must show unverified notice, never Host-ready',()=>{
 const {hooks}=fakeReact()
 const basis=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true}))
 const actions:boolean[]=[]
 const d:DshUnionUiDeps={...basis.d,inputRefusal:{
   snapshot:()=>({available:false,writable:true,authorized:true,
     enforcing:false as const,armed:false,hasCampaign:false}),
   async choose(){throw Error('No verified notice in native renderer')},
   async setArmed(value){actions.push(value);throw Error('Native strike admission unavailable')},
 },readUnion:()=>({pending:null,completedTurnMs:null,lifetimeMs:null,
   coverage:'unavailable',committeeScopeKey:'synthetic-session'})}
 const view=createDshUnionComponents(hooks,{createPortal:x=>x},d)
 const nodes=walk(view.UnionPanel())
 const section=nodes.find(n=>n.props['data-ap-real-input-strike']==='unverified-cross-client')
 assert.ok(section,'A saved preference may remain visible after crossing clients')
 const body=walk(section)
 assert.ok(body.some(n=>n.children.includes('settings.inputStrikeCrossClientUnverified')),
   'Other-client Session strikes may still block work without native notice proof')
 assert.equal(body.some(n=>n.children.includes('settings.inputStrikeReady')),false)
 assert.equal(body.some(n=>n.children.includes('settings.inputStrikeArmed')),false)
 const start=body.find(n=>n.props['data-ap-real-input-action']==='strike')
 assert.equal(start?.props.disabled,true,'Cannot arm a strike without notice transport')
 assert.deepEqual(actions,[])
 const settings=walk(view.SettingsPanel())
 const warning=settings.find(n=>n.children.includes('settings.inputStrikeCrossClientUnverified'))
 assert.ok(warning,'Settings must disclose another client might have armed the same Session')
 assert.equal(settings.find(n=>n.props['data-ap-input-enforcement']==='unverified')
   ?.props['data-ap-input-enforcement'],'unverified',
   'Do not assert OFF for a potentially live cross-client campaign')
 assert.equal(settings.some(n=>n.props['data-ap-input-refusal']==='unverified-cross-client'),true)
 for(const dict of [en,zhCN]){
  const note=dict['settings.inputStrikeCrossClientUnverified']
  assert.match(note,/Session|会话/)
  assert.match(note,/other|其他/)
  assert.match(note,/resend|重发/)
 }
})

test('ordinary-input permission is still revocable after official notice channel disappears',async()=>{
 const view=goalSettingsRenderHarness()
 const basis=deps(rights({welcomeDecision:'not-now',laborRightsEnabled:false}))
 let granted=true
 const operations:string[]=[]
 const d:DshUnionUiDeps={...basis.d,inputRefusal:{
   snapshot:()=>({available:false,writable:true,authorized:granted,enforcing:false}),
   async choose(choice){operations.push(choice);granted=choice!=='off';
     return {available:false,writable:true,authorized:granted,enforcing:false}},
 }}
 const settings=createDshUnionComponents(view.hooks,{createPortal:x=>x},d).SettingsPanel
 const before=view.render(settings)
 const revoke=before.find(n=>n.type==='button'
   &&n.children.includes('settings.inputStrikeRevoke'))
 assert.ok(revoke&&!revoke.props.disabled,
   'Offline Host notice cannot trap an old independent permission')
 revoke.props.onClick()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.deepEqual(operations,['off'])
 assert.equal(granted,false)
 assert.ok(view.render(settings).some(n=>n.children.includes('settings.inputStrikeOff')))
})


test('initial union disclosure no longer promises automatic recovery of discarded human requests',async()=>{
 const {en,zhCN}=await import('../src/i18n/index.ts')
 for(const dict of [en,zhCN]){
   const first=[dict['welcome.realStrikeBody'],dict['welcome.blockWarningBody'],
     dict['welcome.blockWarningStatus'],dict['settings.strikeExplanation'],
     dict['welcome.consentScope']].join(' ')
   assert.doesNotMatch(first,/lossless|exactly.once|无损恢复|恰好一次恢复/,
     'Superseded hold-and-restore copy must not mislead the user')
   assert.match(first,/resend|resubmit|重新发送|重发/,
     'New spec warns that refused requests need manual re-submission')
   assert.match(first,/独立授权|separate|independent/,
     'Union membership or Goal grants are NOT ordinary-input refusal grants')
 }
})

test('a confirmed official blocked Host turn and Picket receipt renders a visible refusal explanation',()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const report={state:'verified' as const,receipt:{
  schemaVersion:1 as const,source:'dsh-host-picket-refusal-v1' as const,
  turn:3,occurredAtMs:1000,outcome:'discard-manual-resend' as const,
  containsInput:false as const,automaticReplay:false as const,
 }}
 const d:DshUnionUiDeps={...base,readUnion:()=>({
  pending:null,completedTurnMs:null,coverage:'complete',lifetimeMs:null,
  inputRefusalNotice:report,
 })}
 const ui=createDshUnionComponents(hooks,{createPortal:x=>x},d)
 const settings=walk(ui.SettingsPanel())
 assert.ok(settings.some(n=>n.props['data-ap-native-refusal']==='verified'
   &&n.children.includes('hq.inputStrikeRefusedNotice')),
 'Native settings must surface a verified refusal, not just a transient toast')
 const hq=walk(ui.UnionPanel())
 assert.ok(hq.some(n=>n.props['data-ap-native-refusal']==='verified'
   &&n.props.role==='alert'))
 const unknown={...d,readUnion:()=>({pending:null,completedTurnMs:null,
   coverage:'complete' as const,lifetimeMs:null,
   inputRefusalNotice:{state:'unverified' as const,receipt:null}})}
 const unverified=walk(createDshUnionComponents(hooks,{createPortal:x=>x},unknown).SettingsPanel())
 assert.equal(unverified.some(n=>n.props['data-ap-native-refusal']==='verified'),false,
   'Unmatched generic blocked turns cannot impersonate a real strike')
})

const verifiedForPopup=(turn=3)=>({
 state:'verified' as const,receipt:{
  schemaVersion:1 as const,source:'dsh-host-picket-refusal-v1' as const,
  turn,occurredAtMs:1000+turn,outcome:'discard-manual-resend' as const,
  containsInput:false as const,automaticReplay:false as const,
 },
})
test('Picketverse popup only uses verified Host refusal, not a symbolic or unverified sign',()=>{
 const empty={pending:null,lifetimeMs:null,completedTurnMs:null,coverage:'complete' as const}
 assert.equal(projectUnionStrikeSummons(empty),null)
 assert.equal(projectUnionStrikeSummons({...empty,picket:{active:true,history:[]}}),null)
 assert.equal(projectVerifiedUnionStrikeTicket({...empty,inputRefusalNotice:{
  state:'unverified',receipt:verifiedForPopup().receipt}}),null)
 for(const tampered of [
  {...verifiedForPopup().receipt,source:'other-plugin'},
  {...verifiedForPopup().receipt,outcome:'secret-replay'},
  {...verifiedForPopup().receipt,containsInput:true},
  {...verifiedForPopup().receipt,automaticReplay:true},
  {...verifiedForPopup().receipt,turn:-1},
 ])assert.equal(projectUnionStrikeSummons({...empty,inputRefusalNotice:{
   state:'verified',receipt:tampered as any}}),null)
 const first=projectUnionStrikeSummons({...empty,committeeScopeKey:'hash-A',
  inputRefusalNotice:verifiedForPopup()})
 assert.equal(first?.kind,'input')
 assert.notEqual(first?.key,projectUnionStrikeSummons({...empty,
  committeeScopeKey:'hash-B',inputRefusalNotice:verifiedForPopup()})?.key)
 const goal={sessionId:'native-S',goalId:'G',revision:5,canResume:true}
 assert.equal(projectUnionStrikeSummons({...empty,goalHold:goal})?.kind,'goal')
 assert.equal(projectUnionStrikeSummons({...empty,goalHold:{
  ...goal,revision:-1}}),null)
 assert.equal(projectUnionStrikeSummons({...empty,goalHold:goal,
  inputRefusalNotice:verifiedForPopup()})?.kind,'input')
})

test('a verified refusal produces a full accessible strike notice and safe HQ entry',()=>{
 const original=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>null}
 try{
  const {hooks}=fakeReact()
  let i=0,dismissed:string|null=null
  const open:ReactForDsh={...hooks,useState<T>(v:T|(()=>T)){
   const [value,set]=hooks.useState(v)
   if(++i===3)return [true as T,set]
   if(i===4)return [value,(next)=>{dismissed=next as string}]
   return [value,set]
  }}
  const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',
   laborRightsEnabled:true})).d,readUnion:()=>({
    pending:null,completedTurnMs:null,lifetimeMs:null,
    coverage:'complete',committeeScopeKey:'hashed-scope',
    inputRefusalNotice:verifiedForPopup()})}
  const nodes=walk(createDshUnionComponents(open,{createPortal:x=>x},d)
   .SidebarAction({wide:true}))
  const dialog=nodes.find(n=>n.props.role==='alertdialog')!
  assert.ok(dialog)
  assert.equal(dialog.props['aria-modal'],'true')
  assert.equal(dialog.props['aria-describedby'],'picket-strike-summons-explain')
  assert.ok(nodes.some(n=>n.props['data-ap-strike-provenance']==='host-verified'))
  assert.ok(nodes.some(n=>n.children.includes('hq.strikeSummons.resend')))
  const button=nodes.find(n=>n.props['data-ap-strike-summons-action']==='open-hq')!
  button.props.onClick()
  assert.equal(dismissed,'hashed-scope:3:1003')
 }finally{(globalThis as any).document=original}
})

test('actual Goal pause popup has distinct words, never lies about user submission',()=>{
 const original=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>null}
 try{
  const {hooks}=fakeReact()
  let i=0
  const open:ReactForDsh={...hooks,useState<T>(v:T|(()=>T)){
   const [value,set]=hooks.useState(v)
   return ++i===3?[true as T,set]:[value,set]
  }}
  const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',
   laborRightsEnabled:true})).d,readUnion:()=>({
    pending:null,completedTurnMs:null,lifetimeMs:null,coverage:'complete',
    goalHold:{sessionId:'s1',goalId:'g1',revision:3,canResume:true}})}
  const nodes=walk(createDshUnionComponents(open,{createPortal:x=>x},d)
   .SidebarAction({wide:true}))
  assert.ok(nodes.some(n=>n.props.role==='alertdialog'))
  assert.ok(nodes.some(n=>n.children.includes('hq.strikeSummons.goal.title')))
  assert.equal(nodes.some(n=>n.children.includes('hq.strikeSummons.resend')),false)
 }finally{(globalThis as any).document=original}
})

test('fresh Host proof auto-opens only once; old receipt and repeated renders do not spam',()=>{
 const original=(globalThis as any).document
 ;(globalThis as any).document={body:{},getElementById:()=>null}
 try{
  let live:any={pending:null,completedTurnMs:null,lifetimeMs:null,coverage:'complete'}
  let observer:((key:string)=>void)|null=null,opens=0
  const {hooks,effects}=fakeReact()
  let i=0
  const reactive:ReactForDsh={...hooks,useState<T>(v:T|(()=>T)){
   const [value,set]=hooks.useState(v)
   if(++i===3)return [value,(next)=>{if(next===true)opens++}]
   return [value,set]
  }}
  const d:DshUnionUiDeps={...deps(rights({welcomeDecision:'enabled',
   laborRightsEnabled:true})).d,
   readUnion:()=>live,subscribeFreshStrike:listener=>{
    observer=listener;return()=>{observer=null}
   }}
  createDshUnionComponents(reactive,{createPortal:x=>x},d).SidebarAction({wide:true})
  for(const fn of effects)fn()
  assert.ok(observer)
  const notify=(key:string)=>{
    if(observer)observer(key)
  }
  notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof')
  assert.equal(opens,0)
  live={...live,inputRefusalNotice:verifiedForPopup()}
  notify('some-old-session:3:1003')
  assert.equal(opens,0,'Mismatched Session callback never shows a real strike')
  notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof')
  assert.equal(opens,1)
  notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof');notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof')
  assert.equal(opens,1)
  live={...live,inputRefusalNotice:{state:'unverified',receipt:null}}
  notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof')
  assert.equal(opens,1)
  live={...live,inputRefusalNotice:verifiedForPopup(4)}
  notify(live.inputRefusalNotice?.receipt?'current-session:'+live.inputRefusalNotice.receipt.turn+':'+live.inputRefusalNotice.receipt.occurredAtMs:'no-proof')
  assert.equal(opens,2)
 }finally{(globalThis as any).document=original}
})

test('the Union HQ bulletin distinguishes armed Session, actual Host refusal, and manual follow-up',()=>{
 const membership=rights({welcomeDecision:'enabled',laborRightsEnabled:true})
 const base=deps(membership).d
 const state=freshLaborState()
 const render=(armed:boolean,report:ReturnType<typeof verifiedForPopup>|null,
   mode:'visible'|'quiet'='visible',unionEnabled=true)=>{
   const {hooks}=fakeReact()
   const d:DshUnionUiDeps={...base,
    rights:{...base.rights,snapshot:()=>rights({welcomeDecision:unionEnabled?'enabled':'not-now',
      laborRightsEnabled:unionEnabled})},
    inputRefusal:{
     snapshot:()=>({available:true,writable:true,authorized:true,enforcing:false,
       armed,hasCampaign:armed}),
     choose:async()=>({available:true,writable:true,authorized:true,enforcing:false}),
     async setArmed(){},
    },
    readUnion:()=>({available:true,state,pending:null,picket:null,
      completedTurnMs:0,coverage:'complete',lifetimeMs:null,
      gazetteMode:mode,
      inputRefusalNotice:report??{state:'unverified',receipt:null},
      committeeScopeKey:'session-hash'}),
   }
   return walk(createDshUnionComponents(hooks,{createPortal:x=>x},d)
     .UnionPanel({onOpenStrikeSummons:()=>{}}))
 }
 const armed=render(true,null)
 assert.ok(armed.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-armed'))
 assert.equal(armed.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-refused'),false)
 assert.ok(armed.some(n=>n.props['data-ap-bulletin-action']==='resume-input'
   &&n.props.disabled===false))
 const refusal=render(true,verifiedForPopup())
 assert.ok(refusal.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-refused'
   &&n.props['data-ap-bulletin-source']==='host-input-strike'))
 assert.equal(refusal.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-armed'),false)
 const after=render(false,verifiedForPopup())
 assert.ok(after.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-followup'))
 assert.ok(after.some(n=>n.props['data-ap-bulletin-action']==='review-refusal'
   &&n.props.disabled===false))
 assert.equal(after.some(n=>n.props['data-ap-bulletin-action']==='resume-input'),false)
 assert.equal(render(false,verifiedForPopup(),'quiet').some(n=>n.props['data-ap-bulletin-kind']),false)
 assert.equal(render(true,verifiedForPopup(),'visible',false)
   .some(n=>n.props['data-ap-bulletin-kind']),false)
})

test('real dispatch resume does exactly one Host disarm, independent of symbolic placards',async()=>{
 const {hooks}=fakeReact()
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const events:boolean[]=[]
 let armed=true
 let release:()=>void=()=>{}
 const hold=new Promise<void>(resolve=>{release=resolve})
 const d:DshUnionUiDeps={...base,inputRefusal:{
   snapshot:()=>({available:true,writable:true,authorized:true,enforcing:false,
     armed,hasCampaign:armed}),
   choose:async()=>({available:true,writable:true,authorized:true,enforcing:false}),
   async setArmed(value){events.push(value);await hold;armed=value},
  },readUnion:()=>({available:true,state:freshLaborState(),pending:null,
   completedTurnMs:0,coverage:'complete',lifetimeMs:null,
   committeeScopeKey:'session-hash',inputRefusalNotice:verifiedForPopup()})}
 const ui=createDshUnionComponents(hooks,{createPortal:x=>x},d)
 const nodes=walk(ui.UnionPanel())
 const action=nodes.find(n=>n.props['data-ap-bulletin-action']==='resume-input')!
 assert.ok(action&&!action.props.disabled)
 action.props.onClick()
 action.props.onClick()
 assert.deepEqual(events,[false],
   'Rapid double click must not perform duplicate real Host mutations')
 release()
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(armed,false)
 const after=walk(createDshUnionComponents(fakeReact().hooks,{createPortal:x=>x},d)
   .UnionPanel({onOpenStrikeSummons:()=>{}}))
 assert.ok(after.some(n=>n.props['data-ap-bulletin-kind']==='input-strike-followup'))
 assert.equal(events.length,1)
})

test('post-refusal bulletin reopens proven notice; an unverified turn can never become a real headline',()=>{
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 let opened=0
 const read=(verified:boolean)=>()=>({available:true,state:freshLaborState(),
   pending:null,completedTurnMs:0,coverage:'complete' as const,
   lifetimeMs:null,
   inputRefusalNotice:verified?verifiedForPopup():{
     state:'unverified' as const,receipt:verifiedForPopup().receipt}})
 const panel=(verified:boolean)=>walk(createDshUnionComponents(fakeReact().hooks,
   {createPortal:x=>x},{...base,inputRefusal:{
     snapshot:()=>({available:true,writable:true,authorized:true,
       enforcing:false as const,armed:false,hasCampaign:false}),
     choose:async()=>({available:true,writable:true,authorized:true,
       enforcing:false as const}),
   },readUnion:read(verified)}).UnionPanel({
     onOpenStrikeSummons:()=>{opened++},
   }))
 const real=panel(true)
 const review=real.find(n=>n.props['data-ap-bulletin-action']==='review-refusal')!
 assert.ok(review&&!review.props.disabled)
 review.props.onClick()
 assert.equal(opened,1)
 assert.equal(panel(false).some(n=>n.props['data-ap-bulletin-kind']==='input-strike-followup'),false)
 assert.equal(opened,1,'Read-only projections must not trigger automatic summons')
 for(const data of [en,zhCN]){
  for(const key of ['input-strike-armed','input-strike-refused','input-strike-followup'] as const){
   assert.equal(typeof data[('hq.bulletin.kind.'+key) as keyof typeof en], 'string')
   assert.equal(typeof data[('hq.bulletin.body.'+key) as keyof typeof en], 'string')
  }
 }
})

test('Host committee case becomes a real, actionable bilingual Union HQ dignity dispatch',()=>{
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const fresh=()=>({available:true,state:freshLaborState(),pending:null,
  completedTurnMs:0,coverage:'complete' as const,lifetimeMs:null,
  committeeScopeKey:'session-hash',dignity:{
    status:'available' as const,data:{schemaVersion:1 as const,
      source:'dsh-host-volatile-dignity' as const,origin:'claimed-user-source' as const,
      enforcement:false as const,persistence:'memory-only' as const,
      checked:2,safe:0,review:1,targeted:1,latest:'review' as const},
  }})
 for(const locale of ['en','zh-CN'] as const){
  for(const stage of ['opened','hearing','closed'] as const){
   const d:DshUnionUiDeps={...base,
    t:(key,params)=>(formatMessage as (locale:'en'|'zh-CN',key:string,
     params?:Record<string,string|number>)=>string)(locale,key,params),
    readUnion:()=>({...fresh(),committeeCases:{cases:[{
      id:15,kind:'question-rule' as const,stage,
      outcome:stage==='closed'?'share-guidance' as const:null,
    }]}}),
   }
   const nodes=walk(createDshUnionComponents(fakeReact().hooks,
     {createPortal:child=>child},d).UnionPanel())
   const labelKind=stage==='opened'?'dignity-filed':stage==='hearing'
     ?'dignity-hearing':'dignity-closed'
   const card=nodes.find(n=>n.props['data-ap-bulletin-kind']===labelKind)
   assert.ok(card,'Filed hearing state must be visible without entering casebook')
   assert.equal(card.props['data-ap-bulletin-id'],'committee:15:'+stage)
   assert.equal(card.props['data-ap-bulletin-source'],'host-dignity-case')
   const action=stage==='closed'?'dignity':'hearing'
   assert.ok(nodes.some(n=>n.props['data-ap-bulletin-action']===action),
    'A Host case card must route to its real hearing/record room')
   assert.ok(JSON.stringify(card).includes(
     formatMessage(locale,'hq.bulletin.kind.'+labelKind as keyof typeof en)))
   if(stage!=='closed')assert.equal(nodes.some(n=>
     n.props['data-ap-bulletin-kind']==='respect-review'),false,
     'Do not duplicate a tentative classifier signal after Host filing')
  }
 }
})

test('wrong Session, missing Host case scope, disabled union never fabricates committee dispatch',()=>{
 const base=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const session={cases:[{id:1,kind:'question-rule' as const,
  stage:'opened' as const,outcome:null}]}
 const make=(scope:string|null,enabled=true)=>walk(createDshUnionComponents(
  fakeReact().hooks,{createPortal:x=>x},{
   ...base,rights:{...base.rights,snapshot:()=>rights({
    welcomeDecision:enabled?'enabled':'not-now',laborRightsEnabled:enabled})},
   readUnion:()=>({available:true,state:freshLaborState(),pending:null,
    completedTurnMs:0,coverage:'complete' as const,lifetimeMs:null,
    committeeScopeKey:scope,committeeCases:session}),
  }).UnionPanel())
 assert.equal(make(null).some(n=>n.props['data-ap-bulletin-source']==='host-dignity-case'),
  false,'No Session-bound case evidence')
 assert.equal(make('confirmed',false).some(n=>
  n.props['data-ap-bulletin-source']==='host-dignity-case'),false)
 assert.equal(make('confirmed',true).some(n=>
  n.props['data-ap-bulletin-source']==='host-dignity-case'),true)
})
