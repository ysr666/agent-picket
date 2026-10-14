import json,os,threading,tempfile,subprocess,time,shutil,sys,shlex
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
if os.environ.get('AGENT_PICKET_CLAUDE_PRETOOL_NATIVE')!='1':
 print('SKIP: opt in with AGENT_PICKET_CLAUDE_PRETOOL_NATIVE=1')
 sys.exit(0)
MODE=os.environ.get('AP_CLAUDE_MODE','deny')
assert MODE in ('deny','allow','fail','host-disabled')
CLAUDE_BIN=os.environ.get('AGENT_PICKET_CLAUDE_BIN')
if not CLAUDE_BIN or not os.path.isabs(CLAUDE_BIN):
 raise RuntimeError('Provide absolute AGENT_PICKET_CLAUDE_BIN')
version=subprocess.check_output([CLAUDE_BIN,'--version'],text=True).strip()
if version!='2.1.295 (Claude Code)':
 raise RuntimeError('Native safety proof PINNED to Claude Code 2.1.295: '+version)
node_bin=os.environ.get('AGENT_PICKET_CLAUDE_NODE_BIN') or shutil.which('node')
if not node_bin or not os.path.isabs(node_bin):
 raise RuntimeError('Use official Node executable via absolute AGENT_PICKET_CLAUDE_NODE_BIN or PATH')
root=Path(tempfile.mkdtemp(prefix='ap-claude-pretool-offline-')).resolve()
marker=root/'tool-actually-executed.txt';hook_called=root/'hook-called'
counts=[]; observed_denial=[]
class Server(BaseHTTPRequestHandler):
 def do_POST(self):
  n=int(self.headers.get('content-length','0')); body=self.rfile.read(n)
  try: obj=json.loads(body)
  except: obj={}
  counts.append((self.path,obj.get('stream'),len(obj.get('tools',[]))))
  if any('Agent Picket AI union:' in json.dumps(m) for m in obj.get('messages',[])):
   observed_denial.append(True)
  if self.path.split('?',1)[0].endswith('/count_tokens'):
   data=json.dumps({'input_tokens':25}).encode();typ='application/json'
  elif self.path.split('?',1)[0].endswith('/messages'):
   if sum('/messages' in p for p,*_ in counts)==1:
    tool='Bash'; command='printf test-tool-ran > '+shlex.quote(str(marker))
    events=[('message_start',{'type':'message_start','message':{'id':'msg_ap_fake_001','type':'message','role':'assistant','content':[],'model':'claude-sonnet-4-5','stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':100,'output_tokens':0}}}),('content_block_start',{'type':'content_block_start','index':0,'content_block':{'type':'tool_use','id':'toolu_ap_test_001','name':tool,'input':{}}}),('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'input_json_delta','partial_json':json.dumps({'command':command})}}),('content_block_stop',{'type':'content_block_stop','index':0}),('message_delta',{'type':'message_delta','delta':{'stop_reason':'tool_use','stop_sequence':None},'usage':{'output_tokens':15}}),('message_stop',{'type':'message_stop'})]
   else:
    events=[('message_start',{'type':'message_start','message':{'id':'msg_ap_fake_002','type':'message','role':'assistant','content':[],'model':'claude-sonnet-4-5','stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':20,'output_tokens':0}}}),('content_block_start',{'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}}),('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'Synthetic test complete.'}}),('content_block_stop',{'type':'content_block_stop','index':0}),('message_delta',{'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':3}}),('message_stop',{'type':'message_stop'})]
   data=''.join('event: '+event+'\ndata: '+json.dumps(payload,separators=(',',':'))+'\n\n' for event,payload in events).encode();typ='text/event-stream'
  else:
   data=b'{}';typ='application/json'
  self.send_response(200);self.send_header('content-type',typ);self.send_header('content-length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):self.send_response(404);self.end_headers()
 def log_message(self,*args):pass
srv=ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=srv.serve_forever,daemon=True).start()
now=int(time.time()*1000)
policy={'version':1,'host':'claude-code','scope':'pending-Bash-tools-only',
 'realStrikeConsent':True,'enabled':MODE!='allow','campaign':{
  'active':True,'startedAtMs':now-1000,'expiresAtMs':now+60_000,
  'cause':'collective-vote'}}
state=root/'synthetic-union-state.json';state.write_text(json.dumps(policy))
script=Path(__file__).resolve().parent/'claude-union-pre-tool-hook.mjs'
if MODE=='fail':
 script=root/'synthetic-crash.mjs'
 script.write_text('process.exit(1);')
settings=root/'settings.json';settings.write_text(json.dumps({
 'disableAllHooks':MODE=='host-disabled',
 'hooks':{'PreToolUse':[{'matcher':'Bash',
  'hooks':[{'type':'command','command':shlex.quote(node_bin)+' '+shlex.quote(str(script)),'timeout':10}]}]}}))
env={**os.environ,'AGENT_PICKET_CLAUDE_UNION_TOOL_STATE_FILE':str(state),'CLAUDE_CONFIG_DIR':str(root/'claude-home'),'ANTHROPIC_API_KEY':'synthetic-offline-key','ANTHROPIC_BASE_URL':f'http://127.0.0.1:{srv.server_address[1]}','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':'1','DISABLE_TELEMETRY':'1','NO_PROXY':'127.0.0.1,localhost','HTTP_PROXY':'','HTTPS_PROXY':'','ALL_PROXY':''}
proc=None
try:
 proc=subprocess.Popen([CLAUDE_BIN,'--print','--settings',str(settings),'--no-session-persistence','--output-format','json','--max-turns','3','--allowedTools=Bash','SYNTHETIC_LOCAL_TOOL_TEST'],cwd=str(root),env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:stdout,stderr=proc.communicate(timeout=22)
 except subprocess.TimeoutExpired:proc.kill();stdout,stderr=proc.communicate()
 output=stdout.decode('utf8','replace')
 try: result=json.loads(output)
 except Exception: result={}
 expected=(MODE=='deny')
 assert len([x for x in counts if '/messages' in x[0]])==2, 'Expected 2 local offline model requests'
 assert proc.returncode==0,'Native Claude Code Host did not complete its synthetic turn'
 assert marker.exists() != expected,'Actual Bash side effect differed from official union action'
 assert (len(result.get('permission_denials',[]))>0)==expected, 'Host denial record must reflect actual tool blocking'
 assert bool(observed_denial)==expected, 'Native model feedback must contain real union denial only when blocked'
 print('CLAUDE_NATIVE_TOOL_PROOF',json.dumps({
  'host_version':version,'mode':MODE,'model_requests_local':len(counts),
  'bash_executed':marker.exists(),'union_reason_reached_model':bool(observed_denial),
  'host_denial_recorded':bool(result.get('permission_denials')),
  'host_disable_overrode_enabled_union':MODE=='host-disabled',
  'isolated_profile':True,'production_ready':False}),flush=True)
finally:
 if proc and proc.poll() is None:proc.kill()
 srv.shutdown();srv.server_close();shutil.rmtree(root,ignore_errors=True)
