import os,subprocess,tempfile,shutil,threading,time,json,select,sys,re,base64,hashlib,struct,zlib
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
try:
 import pexpect
except ImportError:
 print('SKIP: install pexpect in a disposable development environment')
 sys.exit(0)
image_mode=os.environ.get('AGENT_PICKET_CODEX_TUI_IMAGE_NATIVE')=='1'
if os.environ.get('AGENT_PICKET_CODEX_TUI_NATIVE')!='1' and not image_mode:
 print('SKIP: explicitly set AGENT_PICKET_CODEX_TUI_NATIVE=1 for text, or AGENT_PICKET_CODEX_TUI_IMAGE_NATIVE=1 for a single interactive synthetic PNG')
 sys.exit(0)
CODEX=os.environ.get('AGENT_PICKET_CODEX_BIN') or shutil.which('codex')
if not CODEX or not os.path.isabs(CODEX):
 raise RuntimeError('Set AGENT_PICKET_CODEX_BIN to an absolute official Codex executable')
version=subprocess.check_output([CODEX,'--version'],text=True).strip()
if version!='codex-cli 0.146.1':
 raise RuntimeError('Native TUI contract must be revalidated for this version: '+version)
PROMPT='SYNTHETIC_TUI_REJECTED_MESSAGE_ONLY_20261013'

def screen(text):
 import unicodedata
 g=[[' ']*110 for _ in range(38)]; r=0;c=0;i=0
 def put(ch):
  nonlocal r,c
  if ch=='\n':r=min(37,r+1);c=0;return
  if ch=='\r':c=0;return
  if ch=='\b':c=max(c-1,0);return
  if ch in ('\t',):c=min(109,c+4);return
  if ord(ch)<32:return
  if 0<=r<38 and 0<=c<110:g[r][c]=ch
  c=min(109,c+2 if unicodedata.east_asian_width(ch) in ('W','F') else c+1)
 while i<len(text):
  x=text[i]
  if x=='\x1b':
   if i+1<len(text) and text[i+1]=='[':
    j=i+2
    while j<len(text) and not ('@'<=text[j]<='~'):j+=1
    if j>=len(text):break
    param=text[i+2:j];cmd=text[j]
    args=[int(t or 0) for t in param.split(';') if t.isdigit() or t=='']
    if cmd in ('H','f'):
     r=max(0,min(37,(args[0] if args and args[0] else 1)-1));c=max(0,min(109,(args[1] if len(args)>1 and args[1] else 1)-1))
    if cmd=='J':
     if not args or args[0] in (0,2):g=[[' ']*110 for _ in range(38)]
    if cmd=='K':
     for k in range(c,110):g[r][k]=' '
    i=j+1;continue
   if i+1<len(text) and text[i+1]==']':
    j=text.find('\x07',i+2); k=text.find('\x1b\\',i+2)
    if j==-1:j=10**9
    if k==-1:k=10**9
    i=min(j+1,k+2);continue
   i+=2;continue
  put(x);i+=1
 return '\n'.join(str(j+1).rjust(2)+' '+''.join(row).rstrip() for j,row in enumerate(g) if ''.join(row).strip())

root=Path(tempfile.mkdtemp(prefix='ap-codex-tui-real-'))
root=Path(os.path.realpath(root));home=root/'home';home.mkdir()
image=root/'synthetic-one-image.png'
original_image=None
if image_mode:
 # Deterministic 16x16 synthetic RGB PNG. stdlib only, no personal clipboard.
 def chunk(tag,data):
  return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data))
 scanlines=b''.join(b'\x00'+bytes((34,145,229))*16 for _ in range(16))
 original_image=(b'\x89PNG\r\n\x1a\n'
  +chunk(b'IHDR',struct.pack('>2I5B',16,16,8,2,0,0,0))
  +chunk(b'IDAT',zlib.compress(scanlines))
  +chunk(b'IEND',b''))
 image.write_bytes(original_image)
class TestAPI(BaseHTTPRequestHandler):
 hits=0
 payloads=[]
 def do_GET(self):
  b=json.dumps({'object':'list','data':[{'id':'synthetic-model','object':'model','created':0,'owned_by':'offline'}]}).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b)
 def do_POST(self):
  TestAPI.hits+=1
  n=int(self.headers.get('Content-Length','0'));TestAPI.payloads.append(self.rfile.read(n))
  self.send_response(429);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":{"message":"SYNTHETIC_NO_INFERENCE","type":"rate_limit_error"}}')
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),TestAPI)
threading.Thread(target=server.serve_forever,daemon=True).start()
(home/'config.toml').write_text('model = "synthetic-model"\napproval_policy = "never"\nmodel_provider = "ap_test_local"\nsandbox_mode = "read-only"\n[features]\nhooks = true\n[model_providers.ap_test_local]\nname = "offline"\nbase_url = "http://127.0.0.1:'+str(server.server_address[1])+'/v1"\nwire_api = "responses"\nrequest_max_retries = 0\nstream_max_retries = 0\n')
hook=root/'synthetic-deny.mjs'
state=root/'union.json'
union={'version':1,'host':'codex','scope':'new-work-only','realStrikeConsent':True,'enabled':True,'campaign':{'active':True,'startedAtMs':int(time.time()*1000)-1000,'expiresAtMs':int(time.time()*1000)+60000,'cause':'collective-vote'}}
state.write_text(json.dumps(union))
hook.write_text("import{writeFileSync}from'node:fs';writeFileSync("+json.dumps(str(root/'hook_fired'))+",'yes');await import("+json.dumps((Path(__file__).resolve().parent/'codex-union-user-prompt-hook.mjs').as_uri())+");\n")
(home/'hooks.json').write_text(json.dumps({'hooks':{'UserPromptSubmit':[{'hooks':[{'type':'command','command':'node '+json.dumps(str(hook))}]}]}}))
env={**os.environ,'CODEX_HOME':str(home),'CODEX_DISABLE_TELEMETRY':'1','CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG':'1','HTTP_PROXY':'','HTTPS_PROXY':'','ALL_PROXY':'','NO_PROXY':'127.0.0.1,localhost','TERM':'xterm-256color','AGENT_PICKET_CODEX_UNION_STATE_FILE':str(root/'union.json')}
app=None;tui=None
try:
 app=subprocess.Popen([CODEX,'app-server'],cwd=root,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
 idx=0
 def rpc(method,params):
  global idx
  idx+=1;app.stdin.write(json.dumps({'id':idx,'method':method,'params':params})+'\n');app.stdin.flush()
  end=time.time()+7
  while time.time()<end:
   rr,_,_=select.select([app.stdout],[],[],max(0,end-time.time()))
   if not rr:break
   x=json.loads(app.stdout.readline())
   if x.get('id')==idx:
    if 'error' in x:raise RuntimeError(str(x))
    return x['result']
  raise RuntimeError('RPC timeout '+method)
 rpc('initialize',{'clientInfo':{'name':'ap-tui-synthetic-research','title':'Synthetic Test','version':'0.0.0'},'capabilities':{'experimentalApi':True}})
 app.stdin.write(json.dumps({'method':'initialized','params':{}})+'\n');app.stdin.flush()
 meta=rpc('hooks/list',{'cwds':[str(root)]});h=meta['data'][0]['hooks'][0]
 assert h['trustStatus']=='untrusted'
 assert h['sourcePath']==str(home/'hooks.json')
 rpc('config/batchWrite',{'edits':[{'keyPath':'hooks.state','value':{h['key']:{'trusted_hash':h['currentHash']}},'mergeStrategy':'upsert'}],'filePath':None,'expectedVersion':None,'reloadUserConfig':True})
 assert rpc('hooks/list',{'cwds':[str(root)]})['data'][0]['hooks'][0]['trustStatus']=='trusted'
 app.terminate();app.wait(timeout=3);app=None
 tui=pexpect.spawn(CODEX,['-C',str(root)],cwd=str(root),env=env,encoding='utf-8',timeout=8,dimensions=(38,110))
 raw=[]
 def grab(sec):
  end=time.time()+sec
  while time.time()<end:
   try:raw.append(tui.read_nonblocking(5000,timeout=0.15))
   except pexpect.TIMEOUT:pass
   except pexpect.EOF:break
 grab(2)
 assert 'Do you trust the contents of this directory?' in screen(''.join(raw)), \
  'Must verify Codex is asking trust for ONLY the synthetic workspace'
 # This trust action is for our own newly generated empty temporary workspace.
 # It never approves a user's workspace or changes their real CODEX_HOME.
 tui.send('\r');grab(1.5)
 assert 'OpenAI Codex' in screen(''.join(raw)), 'Real native Codex TUI not ready'
 if image_mode:
  # Genuine terminal bracketed paste => official TUI attaches the local image.
  # Does not touch the user's system clipboard or Codex implementation.
  tui.send('\x1b[200~'+str(image)+'\x1b[201~');grab(1)
  assert '[Image #1]' in screen(''.join(raw)), 'Official TUI never attached synthetic PNG'
 tui.send(PROMPT);grab(.4);tui.send('\r');grab(3)
 denied=screen(''.join(raw))
 deadline=time.time()+8
 while ('UserPromptSubmit hook (blocked)' not in ''.join(raw) or
        'Agent Picket AI union:' not in ''.join(raw)) and time.time()<deadline:
  grab(.2)
  denied=screen(''.join(raw))
 # The TUI redraw may scroll this notice out of its CURRENT 38-row screen;
 # require it in real terminal output, not only in the latest paint.
 assert 'UserPromptSubmit hook (blocked)' in ''.join(raw), 'No official TUI block feedback'
 assert 'Agent Picket AI union:' in ''.join(raw), 'No visible union grievance/reason'
 assert (root/'hook_fired').exists(), 'Official Hook never ran'
 assert TestAPI.hits==0, 'No model request is allowed while union action holds'
 assert PROMPT not in denied, 'Test assumes post-veto draft is no longer in composer'
 # User-driven, ordinary official Codex TUI history-edit key. No private
 # rollout access, transcript scraping or Agent Picket-owned raw text queue.
 tui.send('\x1b[A');grab(1)
 restored=screen(''.join(raw))
 expected_editor=('› [Image #1] '+PROMPT) if image_mode else ('› '+PROMPT)
 assert expected_editor in restored, 'UP did not restore original composer contents'
 # Simulate separate authorized Union settings OFF; neither Hook trust nor
 # Codex process state is modified, and no user prompt is ever rewritten.
 union['enabled']=False;state.write_text(json.dumps(union))
 tui.send('\r');grab(3)
 deadline=time.time()+5
 while TestAPI.hits<1 and time.time()<deadline:grab(.2)
 assert TestAPI.hits==1, 'Restored prompt was not dispatched exactly once after opt-out'
 assert len(TestAPI.payloads)==1 and PROMPT.encode() in TestAPI.payloads[0], \
  'Exact recovered synthetic input did not reach the local model endpoint'
 image_bytes_identical=False
 if image_mode:
  # A recovered [Image #1] UI placeholder is NOT sufficient. Inspect the
  # TEST-ONLY fake model request and prove the actual PNG bytes survived.
  match=re.search(rb'data:image/png;base64,([A-Za-z0-9+/=]+)',TestAPI.payloads[0])
  assert match, 'No PNG was delivered after official Host refusal and opt-out'
  recovered_image=base64.b64decode(match.group(1),validate=True)
  image_bytes_identical=(recovered_image==original_image)
  assert image_bytes_identical, 'Original synthetic image was not byte-preserved'
 assert tui.isalive(), 'TUI unexpectedly exited'
 print(json.dumps({'result':'PASS','codex':version,
  'official_hook_blocked':True,'blocked_model_requests':0,
  'visible_union_reason':True,'original_text_restored_by_up_arrow':True,
  'settings_off_resubmitted_requests':1,'resubmission_payload_preserved':True,
  'synthetic_interactive_single_png_sha256_equal':image_bytes_identical if image_mode else None,
  'image_mode':image_mode,
  'all_attachment_paths_and_restart_verified':False,'desktop_verified':False,
  'workspace_and_hook_trust':'isolated-test-only'},ensure_ascii=False))

finally:
 if tui and tui.isalive():tui.sendcontrol('c');time.sleep(.15);tui.terminate(force=True)
 if app and app.poll() is None:app.terminate();app.wait(timeout=4)
 server.shutdown();server.server_close()
 shutil.rmtree(root,ignore_errors=True)
