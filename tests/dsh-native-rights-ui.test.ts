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
