import assert from 'node:assert/strict'
import test from 'node:test'
import {
 createDshUnionComponents,registerDshNativeRightsSlots,
 type ReactForDsh,type DshUnionUiDeps,projectUnionQuickWork,projectUnionFrontScene,
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
 assert.ok(strings.includes('hq.scene.desk'))
 assert.ok(strings.includes('hq.score.explain'))
 assert.ok(strings.includes('hq.score.privacy'))
 assert.ok(strings.includes('hq.nextDemand.note'))
 assert.ok(strings.includes('4 / 100')) // 1h / 8h * 35 -> 4
 assert.equal(nodes.find(n=>n.type==='meter')?.props.value,4)
 assert.ok(nodes.find(n=>n.type==='details'&&n.children.some(x=>typeof x==='object'
  &&x!==null&&(x as Node).children?.includes('hq.score.explain'))))
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
 const dispatchIndex=nodes.findIndex(n=>n.props['aria-label']==='hq.brief.title')
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
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('hq.brief.review')))
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
 assert.equal(nodes.some(n=>n.type==='button'&&n.children.includes('hq.disable')),false,
   'Exit belongs in Union cause/settings rather than beside the primary bargaining action')
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

test('the dignity appeal action navigates to its actual unsent draft for keyboard users',()=>{
 const {hooks}=fakeReact()
 const d=deps(rights({welcomeDecision:'enabled',laborRightsEnabled:true})).d
 const withDignity:DshUnionUiDeps={...d,readUnion:()=>({
  pending:null,available:true,completedTurnMs:null,coverage:'not-loaded',lifetimeMs:null,
  dignity:{status:'available',data:{
   schemaVersion:1,source:'dsh-host-volatile-dignity',
   origin:'claimed-user-source',persistence:'memory-only',enforcement:false,
   checked:2,safe:0,review:1,targeted:1,latest:'review',
  }},
 })}
 const nodes=walk(createDshUnionComponents(hooks,{createPortal:child=>child},
  withDignity).UnionPanel())
 const appeal=nodes.find(n=>n.type==='button'
  &&n.children.includes('hq.dignity.appeal'))
 const heading=nodes.find(n=>n.type==='h3'
  &&n.children.includes('hq.campaign.title'))
 assert.ok(appeal)
 assert.ok(heading)
 assert.equal(heading.props.tabIndex,-1,
  'Campaign heading must be focusable without adding a tab stop')
 assert.equal(typeof heading.props.ref,'function',
  'The actual destination must receive a focus ref')
 let moved=0
 heading.props.ref({focus(){moved++}})
 appeal.props.onClick()
 assert.equal(moved,1,
  'Challenge should reveal the lower draft by focusing its actual heading')
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
 const rows=Array.from({length:7},(_,i)=>({day:'2026-10-'+String(i+6).padStart(2,'0'),work:emptyWork()}))
 rows[6]!.work={...emptyWork(),completedTurnMs:8*3_600_000}
 const scoped:DshUnionUiDeps={...d,readUnion:()=>({
   available:true,pending:null,completedTurnMs:null,coverage:'partial',lifetimeMs:null,
   lifetimeWork:{status:'available',data:{schemaVersion:1,source:'dsh-host-durable-work',
     generatedAtMs:0,windowDays:7,durationBasis:'completed-turn-wall-clock-including-waits',
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
 assert.equal(disabled.length,2,'Both enforcement and per-strike controls must be unavailable')
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
  assert.equal(dialog.props.className,'ap-ui ap-dialog')
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
