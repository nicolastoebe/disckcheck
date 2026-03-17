import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Evaluation, User, EvaluationType } from './types';
import {
  Car, Plus, FileText, Trash2, LogOut, ChevronRight,
  CheckCircle2, AlertCircle, XCircle, Camera, ArrowLeft,
  Download, LayoutDashboard, Search, Eye, User as UserIcon,
  X, RefreshCw, ImagePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate, formatCurrency } from './lib/utils';
import { CHECKLIST_TEMPLATES } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Toast ────────────────────────────────────────────────────────────────────
const useToast = () => {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' }[]>([]);
  const show = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };
  return { toasts, show };
};

const ToastContainer = ({ toasts }: { toasts: ReturnType<typeof useToast>['toasts'] }) => (
  <div className="fixed left-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
       style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
    <AnimatePresence>
      {toasts.map(t => (
        <motion.div key={t.id}
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          className={cn('mx-auto w-full max-w-sm px-5 py-3.5 rounded-2xl shadow-xl text-white text-sm font-bold text-center',
            t.type === 'success' ? 'bg-brand-dark-green' : 'bg-red-500')}>
          {t.msg}
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

// ─── iOS-safe PDF download ────────────────────────────────────────────────────
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
};

// ─── Image compression ───────────────────────────────────────────────────────
const compressImage = (base64Str: string, maxW = 1200, maxH = 1200): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h) { if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; } }
      else        { if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; } }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')?.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });

// ─── CameraInput — iOS camera + gallery bottom sheet ─────────────────────────
const CameraInput = ({ onCapture, children, className }: {
  onCapture: (b64: string) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      onCapture(await compressImage(reader.result as string));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[150] flex items-end" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full bg-white rounded-t-[2rem] p-6 shadow-2xl"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-center text-xs font-black uppercase tracking-widest text-gray-400 mb-5">Adicionar foto</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center gap-2 bg-brand-gray border border-brand-border rounded-2xl py-6 cursor-pointer active:scale-95 transition-all">
                  <Camera className="text-brand-dark-green" size={28} />
                  <span className="text-xs font-bold text-brand-black">Câmera</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                </label>
                <label className="flex flex-col items-center justify-center gap-2 bg-brand-gray border border-brand-border rounded-2xl py-6 cursor-pointer active:scale-95 transition-all">
                  <ImagePlus className="text-brand-dark-green" size={28} />
                  <span className="text-xs font-bold text-brand-black">Galeria</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-full mt-3 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl active:scale-95 transition-all">
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

// ─── LoginPage ────────────────────────────────────────────────────────────────
const LoginPage = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const [email, setEmail]       = useState('admin@disckcheck.com');
  const [password, setPassword] = useState('DisckCheck#2026');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) onLogin(await res.json());
      else setError('E-mail ou senha inválidos.');
    } catch { setError('Erro de conexão. Verifique sua internet.'); }
    finally   { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-black p-6 safe-top safe-bottom relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-green/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-accent/10 blur-[120px] rounded-full" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-brand-dark-green rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-brand-dark-green/30">
            <svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
              {/* Body */}
              <rect x="4" y="18" width="56" height="14" rx="4" fill="#fff" fillOpacity="0.15"/>
              <rect x="4" y="18" width="56" height="14" rx="4" stroke="#fff" strokeWidth="2"/>
              {/* Roof */}
              <path d="M16 18 C18 10, 24 7, 32 7 C40 7, 46 10, 48 18" stroke="#fff" strokeWidth="2" fill="#fff" fillOpacity="0.1"/>
              {/* Windows */}
              <path d="M19 18 C20 12, 24 9, 32 9 C38 9, 42 12, 44 18" fill="#fff" fillOpacity="0.25"/>
              <line x1="32" y1="9" x2="32" y2="18" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.5"/>
              {/* Wheels */}
              <circle cx="16" cy="32" r="6" fill="#7F0000" stroke="#fff" strokeWidth="2"/>
              <circle cx="16" cy="32" r="2.5" fill="#fff" fillOpacity="0.8"/>
              <circle cx="48" cy="32" r="6" fill="#7F0000" stroke="#fff" strokeWidth="2"/>
              <circle cx="48" cy="32" r="2.5" fill="#fff" fillOpacity="0.8"/>
              {/* Headlight */}
              <rect x="56" y="21" width="4" height="3" rx="1.5" fill="#fff" fillOpacity="0.9"/>
              {/* Taillight */}
              <rect x="4" y="21" width="4" height="3" rx="1.5" fill="#E53E3E" fillOpacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold font-display text-brand-black tracking-tight">DisckCheck</h1>
          <p className="text-gray-400 text-sm font-medium mt-1">Avaliação Automotiva Premium</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1 tracking-widest">E-mail</label>
            <input type="email" inputMode="email" autoComplete="email" className="input-field"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1 tracking-widest">Senha</label>
            <input type="password" autoComplete="current-password" className="input-field"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-red-500 text-sm font-medium text-center">{error}</motion.p>
            )}
          </AnimatePresence>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-6 py-5 text-sm tracking-widest">
            {loading ? <span className="flex items-center gap-2"><RefreshCw size={16} className="animate-spin" />AUTENTICANDO...</span> : 'ENTRAR NO SISTEMA'}
          </button>
        </form>
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center">
          <a href="https://linktr.ee/nicolastoebe" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-brand-green text-[10px] font-bold tracking-widest uppercase">
            <Eye className="w-3 h-3" /> Nossos Canais e Serviços
          </a>
        </div>
        <p className="text-center text-[10px] text-gray-300 mt-6 uppercase font-bold">© 2026 DisckCheck – Inteligência em Vistoria</p>
      </motion.div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, onNew, onLogout, onUsers }: { user: User; onNew: () => void; onLogout: () => void; onUsers?: () => void }) => {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [generating, setGenerating]   = useState<number | null>(null);
  const { toasts, show } = useToast();

  useEffect(() => {
    const t = setTimeout(() => fetchEvaluations(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEvaluations = async (q = '') => {
    setLoading(true);
    try {
      const data = await fetch(`/api/evaluations?q=${encodeURIComponent(q)}&user_id=${user.id}&role=${user.role||'inspector'}`).then(r => r.json());
      setEvaluations(data);
    } catch { show('Erro ao carregar avaliações', 'error'); }
    finally   { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/evaluations/${id}`, { method: 'DELETE' });
    if (res.ok) { setEvaluations(ev => ev.filter(e => e.id !== id)); setDeletingId(null); show('Laudo excluído'); }
    else show('Erro ao excluir', 'error');
  };

  const generatePDF = async (id: number, preview = false) => {
    setGenerating(id);
    try {
      const data       = await fetch(`/api/evaluations/${id}`).then(r => r.json());
      const doc        = new jsPDF();
      const pH         = doc.internal.pageSize.height;
      const pW         = doc.internal.pageSize.width;

      const addFooter = (d: jsPDF, pg: number, tot: number) => {
        d.setFontSize(7); d.setTextColor(150,150,150);
        d.setDrawColor(230,230,230);
        d.line(20, pH-25, pW-20, pH-25);
        d.text('Este laudo é uma avaliação técnica visual e estrutural não invasiva.', pW/2, pH-22, { align:'center', maxWidth:170 });
        d.text('A DisckCheck não se responsabiliza por vícios ocultos ou alterações posteriores.', pW/2, pH-18, { align:'center', maxWidth:170 });
        d.setTextColor(127,0,0); d.setFont('helvetica','bold');
        d.text('linktr.ee/nicolastoebe', pW/2, pH-12, { align:'center' });
        d.setTextColor(150,150,150); d.setFont('helvetica','normal');
        d.text(`Página ${pg} de ${tot} | DisckCheck`, pW/2, pH-6, { align:'center' });
      };

      // Cover
      doc.setFillColor(127, 0, 0); doc.rect(0,0,pW,45,'F');
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(28);
      doc.text('DISCKCHECK',20,28);
      doc.setFillColor(229,62,62); doc.rect(20,32,40,1.5,'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      doc.text(`CERTIFICADO DE AVALIAÇÃO TÉCNICA | MODALIDADE ${data.type.toUpperCase()}`,20,38);
      doc.setTextColor(40,40,40); doc.setFontSize(14); doc.setFont('helvetica','bold');
      doc.text('DADOS DO VEÍCULO',20,60);

      autoTable(doc, {
        startY: 65,
        body: [
          ['PROPRIETÁRIO',(data.client_name||'').toUpperCase(),'PLACA',(data.plate||'').toUpperCase()],
          ['MARCA/MODELO',`${data.brand||''} ${data.model||''}`.toUpperCase(),'VERSÃO',(data.version||'').toUpperCase()],
          ['COR',(data.color||'-').toUpperCase(),'KM',`${data.km||0} KM`],
          ['ANO',`${data.year_fab||''}/${data.year_model||''}`,'CHASSI',(data.chassis||'').toUpperCase()],
          ['CIDADE',(data.city||'-').toUpperCase(),'DATA',formatDate(data.evaluation_date)],
        ],
        theme:'plain', styles:{fontSize:8.5,cellPadding:3},
        columnStyles:{0:{fontStyle:'bold',textColor:[100,100,100],cellWidth:30},1:{cellWidth:55},2:{fontStyle:'bold',textColor:[100,100,100],cellWidth:30},3:{cellWidth:55}},
        margin:{left:20,right:20,bottom:30},
      });

      const fy = (doc as any).lastAutoTable.finalY+12;
      doc.setDrawColor(240,240,240); doc.setFillColor(250,250,250);
      doc.roundedRect(20,fy,170,45,3,3,'FD');
      doc.setFontSize(11); doc.setTextColor(100,100,100);
      doc.text('CLASSIFICAÇÃO TÉCNICA FINAL:',30,fy+12);
      const sc: Record<string,{c:[number,number,number];l:string}> = {
        approved:{c:[29,185,84],l:'APROVADO - VEÍCULO CERTIFICADO'},
        warning: {c:[234,179,8],l:'APROVADO COM RESSALVAS'},
        reproved:{c:[239,68,68],l:'REPROVADO - NÃO RECOMENDADO'},
      };
      const cfg = sc[data.final_classification]||{c:[0,0,0] as [number,number,number],l:'NÃO CLASSIFICADO'};
      doc.setFillColor(...cfg.c); doc.roundedRect(30,fy+18,150,12,2,2,'F');
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text(cfg.l,105,fy+26,{align:'center'});
      doc.setTextColor(60,60,60); doc.setFontSize(11);
      doc.text('PARECER DO AVALIADOR:',20,fy+65);
      doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
      doc.text(doc.splitTextToSize(data.final_summary||'Nenhum resumo.',170),20,fy+72,{lineHeightFactor:1.5});

      // Photos
      const photos = [
        {l:'FRENTE',d:data.photo_front},{l:'TRASEIRA',d:data.photo_rear},
        {l:'LAT. DIREITA',d:data.photo_side_right},{l:'LAT. ESQUERDA',d:data.photo_side_left},
        {l:'PAINEL',d:data.photo_dashboard},{l:'BANCOS DIANT.',d:data.photo_seats_front},
        {l:'BANCOS TRAS.',d:data.photo_seats_rear},{l:'PORTA-MALAS',d:data.photo_trunk},
      ].filter(p=>p.d);
      if (photos.length > 0) {
        doc.addPage();
        doc.setTextColor(127,0,0); doc.setFont('helvetica','bold'); doc.setFontSize(14);
        doc.text('REGISTRO FOTOGRÁFICO',20,25);
        let py=35, px=20;
        for (let i=0;i<photos.length;i++) {
          if (py>220){doc.addPage();py=25;}
          try {
            doc.setDrawColor(240,240,240); doc.rect(px-1,py-1,82,62);
            doc.addImage(photos[i].d!,'JPEG',px,py,80,60);
            doc.setFontSize(7); doc.setTextColor(100,100,100); doc.setFont('helvetica','bold');
            doc.text(photos[i].l,px,py+65);
          } catch {}
          if (i%2===0){px=110;}else{px=20;py+=78;}
        }
      }

      // Checklist
      doc.addPage();
      doc.setTextColor(127,0,0); doc.setFont('helvetica','bold'); doc.setFontSize(14);
      doc.text('CHECKLIST DE INSPEÇÃO',20,25);
      autoTable(doc,{
        startY:32,
        head:[['CATEGORIA','ITEM DE INSPEÇÃO','STATUS']],
        body:(data.items||[]).map((i:any)=>[i.category.toUpperCase(),i.item_name,(i.status||'').toUpperCase()]),
        theme:'striped',
        headStyles:{fillColor:[127,0,0],fontSize:9,fontStyle:'bold'},
        styles:{fontSize:8,cellPadding:4},
        columnStyles:{2:{fontStyle:'bold',halign:'center'}},
        margin:{bottom:30},
        didParseCell:(d)=>{
          if(d.section==='body'&&d.column.index===2){
            const s=d.cell.text[0];
            if(['REPROVED','PROBLEM','COMPROMISED'].includes(s)) d.cell.styles.textColor=[239,68,68];
            else if(['ORIGINAL','OK'].includes(s)) d.cell.styles.textColor=[29,185,84];
          }
        },
      });

      // Evidence
      const comp=(data.items||[]).filter((i:any)=>i.notes||(i.photos&&i.photos.length>0));
      if(comp.length>0){
        doc.addPage();
        doc.setTextColor(127,0,0); doc.setFont('helvetica','bold'); doc.setFontSize(14);
        doc.text('DETALHAMENTO DE RESSALVAS',20,25);
        let cy=35;
        for(const item of comp){
          if(cy>230){doc.addPage();cy=25;}
          doc.setFillColor(245,245,245); doc.rect(20,cy,170,8,'F');
          doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(40,40,40);
          doc.text(`${item.category}: ${item.item_name}`,25,cy+5.5);
          cy+=12;
          if(item.notes){
            doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80); doc.setFontSize(8.5);
            const lines=doc.splitTextToSize(`OBS: ${item.notes}`,160);
            doc.text(lines,25,cy); cy+=lines.length*5+5;
          }
          if(item.photos?.length){
            let ppx=25;
            for(const ph of item.photos){
              if(ppx>150){ppx=25;cy+=45;}
              if(cy>230){doc.addPage();cy=25;}
              try{doc.addImage(ph,'JPEG',ppx,cy,40,40);}catch{}
              ppx+=45;
            }
            cy+=50;
          }
          cy+=5;
        }
      }

      const tot=(doc as any).internal.getNumberOfPages();
      for(let i=1;i<=tot;i++){doc.setPage(i);addFooter(doc,i,tot);}

      const filename=`laudo_${data.plate}_${data.type}.pdf`;
      if(preview){
        // iOS Safari: data URI works; blob URL is blocked
        window.open(doc.output('datauristring'),'_blank');
      } else {
        downloadBlob(doc.output('blob'), filename);
        show('PDF salvo com sucesso!');
      }
    } catch { show('Erro ao gerar PDF','error'); }
    finally   { setGenerating(null); }
  };

  const stats = {
    total:    evaluations.length,
    approved: evaluations.filter(e=>e.final_classification==='approved').length,
    warning:  evaluations.filter(e=>e.final_classification==='warning').length,
    reproved: evaluations.filter(e=>e.final_classification==='reproved').length,
  };

  const TypeBadge = ({ type }: { type: string }) => (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md uppercase',
      type==='premium'?'bg-purple-100 text-purple-700':type==='complete'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-700')}>
      {type}
    </span>
  );

  const ClassBadge = ({ cls }: { cls: string }) => (
    <span className={cn('status-badge',
      cls==='approved'?'status-approved':cls==='warning'?'status-warning':'status-reproved')}>
      {cls==='approved'?'Aprovado':cls==='warning'?'Ressalvas':'Reprovado'}
    </span>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 safe-top safe-bottom">
      <ToastContainer toasts={toasts} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-dark-green rounded-2xl flex items-center justify-center shadow-lg">
            <UserIcon className="text-brand-green" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-brand-black tracking-tight">Olá, {user.name}</h1>
            <p className="text-sm text-gray-400">Inspetor Técnico Autorizado</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onNew} className="btn-primary hidden md:flex px-8"><Plus size={20}/> NOVA VISTORIA</button>
          {onUsers && (
            <button onClick={onUsers} className="p-4 bg-white border border-brand-border rounded-[1.25rem] text-brand-dark-green hover:bg-brand-dark-green/5 active:scale-95 transition-all shadow-sm" title="Gerenciar Usuários">
              <UserIcon size={22}/>
            </button>
          )}
          <button onClick={onLogout} className="p-4 bg-white border border-brand-border rounded-[1.25rem] text-red-500 hover:bg-red-50 active:scale-95 transition-all shadow-sm">
            <LogOut size={22}/>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8">
        {[
          {label:'Total',     value:stats.total,    icon:FileText,     color:'text-brand-dark-green', bg:'bg-white'},
          {label:'Aprovados', value:stats.approved, icon:CheckCircle2, color:'text-brand-green',      bg:'bg-brand-green/5'},
          {label:'Ressalvas', value:stats.warning,  icon:AlertCircle,  color:'text-yellow-600',       bg:'bg-yellow-50'},
          {label:'Reprovados',value:stats.reproved, icon:XCircle,      color:'text-red-600',          bg:'bg-red-50'},
        ].map((s,i) => (
          <motion.div key={i} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:i*0.08}}
            className={cn('p-5 md:p-7 rounded-[1.75rem] border border-brand-border shadow-sm flex flex-col items-center text-center',s.bg)}>
            <div className={cn('p-2.5 rounded-2xl mb-2',s.bg==='bg-white'?'bg-brand-gray':'bg-white/60')}>
              <s.icon className={s.color} size={22}/>
            </div>
            <span className="text-2xl md:text-3xl font-black text-brand-black">{s.value}</span>
            <span className="text-[9px] md:text-xs text-gray-400 uppercase font-black tracking-widest mt-1">{s.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-border shadow-sm overflow-hidden">
        <div className="p-5 md:p-8 border-b border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-xl md:text-2xl tracking-tight">Avaliações</h2>
            <p className="text-sm text-gray-400 mt-0.5">Gerencie seus laudos técnicos</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
            <input type="search" inputMode="search" placeholder="Buscar placa ou cliente..."
              value={search} onChange={e=>setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-brand-gray/60 border-none rounded-2xl focus:ring-4 focus:ring-brand-green/10 transition-all font-medium"/>
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-brand-gray/50 text-xs uppercase text-gray-400 font-bold">
              <th className="px-6 py-4">Veículo</th><th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Tipo</th><th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Data</th><th className="px-6 py-4 text-right">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-brand-border">
              {loading ? <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Carregando...</td></tr>
              : evaluations.length===0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Nenhuma avaliação encontrada.</td></tr>
              : evaluations.map(ev=>(
                <tr key={ev.id} className="hover:bg-brand-gray/30 transition-colors">
                  <td className="px-6 py-4"><div className="font-bold">{ev.brand} {ev.model}</div><div className="text-xs text-gray-400 font-mono">{ev.plate}</div></td>
                  <td className="px-6 py-4 text-sm">{ev.client_name}</td>
                  <td className="px-6 py-4"><TypeBadge type={ev.type}/></td>
                  <td className="px-6 py-4"><ClassBadge cls={ev.final_classification}/></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(ev.evaluation_date)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={()=>generatePDF(ev.id!,true)} disabled={generating===ev.id} className="p-2.5 text-brand-black hover:bg-brand-gray rounded-xl transition-colors">
                        {generating===ev.id?<RefreshCw size={16} className="animate-spin"/>:<Eye size={16}/>}
                      </button>
                      <button onClick={()=>generatePDF(ev.id!)} disabled={generating===ev.id} className="p-2.5 text-brand-dark-green hover:bg-brand-dark-green/10 rounded-xl transition-colors">
                        <Download size={16}/>
                      </button>
                      <button onClick={()=>setDeletingId(ev.id!)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-brand-border">
          {loading ? (
            <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
              <RefreshCw size={20} className="animate-spin text-brand-green"/><span>Carregando...</span>
            </div>
          ) : evaluations.length===0 ? (
            <div className="p-10 text-center text-gray-400 flex flex-col items-center gap-3">
              <FileText size={36} className="text-gray-200"/>
              <p className="font-medium">Nenhuma avaliação encontrada.</p>
              <p className="text-sm">Toque no botão + para criar uma nova vistoria.</p>
            </div>
          ) : evaluations.map(ev=>(
            <div key={ev.id} className="p-5 space-y-3 active:bg-brand-gray/40 transition-colors">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base leading-tight truncate">{ev.brand} {ev.model}</div>
                  <div className="text-sm text-gray-400 font-mono tracking-wider mt-0.5">{ev.plate}</div>
                </div>
                <ClassBadge cls={ev.final_classification}/>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div>
                  <div className="flex items-center gap-1 font-medium text-brand-black"><UserIcon size={13}/> {ev.client_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDate(ev.evaluation_date)}</div>
                </div>
                <TypeBadge type={ev.type}/>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button onClick={()=>generatePDF(ev.id!,true)} disabled={generating===ev.id}
                  className="py-3 bg-brand-gray text-brand-black rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
                  {generating===ev.id?<RefreshCw size={14} className="animate-spin"/>:<Eye size={14}/>} VER
                </button>
                <button onClick={()=>generatePDF(ev.id!)} disabled={generating===ev.id}
                  className="py-3 bg-brand-dark-green text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
                  <Download size={14}/> PDF
                </button>
                <button onClick={()=>setDeletingId(ev.id!)}
                  className="py-3 bg-red-50 text-red-500 rounded-xl font-bold text-xs flex items-center justify-center active:scale-95 transition-all">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAB mobile */}
      <button onClick={onNew} aria-label="Nova vistoria"
        className="fab md:hidden">
        <Plus size={28}/>
      </button>

      {/* Delete modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{opacity:0,y:60}} animate={{opacity:1,y:0}} exit={{opacity:0,y:60}}
              className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center"
              style={{marginBottom:'env(safe-area-inset-bottom)'}}>
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5"><Trash2 size={28}/></div>
              <h3 className="text-xl font-black mb-2">Excluir Laudo?</h3>
              <p className="text-gray-500 text-sm mb-7">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={()=>setDeletingId(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl active:scale-95">CANCELAR</button>
                <button onClick={()=>handleDelete(deletingId)} className="flex-1 py-4 bg-red-500 text-white font-bold rounded-2xl active:scale-95 shadow-lg shadow-red-500/20">EXCLUIR</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── NewEvaluationWizard ─────────────────────────────────────────────────────
const NewEvaluationWizard = ({ user, onCancel, onComplete }: { user: User; onCancel: ()=>void; onComplete: ()=>void }) => {
  const [step, setStep]       = useState(0);
  const [type, setType]       = useState<EvaluationType|null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, show } = useToast();
  const [formData, setFormData] = useState<Partial<Evaluation>>({
    user_id: user.id,
    evaluation_date: new Date().toISOString().split('T')[0],
    final_classification: 'approved',
    photos: [], items: [],
  });

  useEffect(() => { window.scrollTo({top:0,behavior:'smooth'}); }, [step]);

  const handleSelectType = (t: EvaluationType) => {
    setType(t);
    setFormData(p => ({...p, type:t, items: CHECKLIST_TEMPLATES[t].map(i=>({...i}))}));
    setStep(1);
  };

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => {
    const {name, value} = e.target;
    setFormData(p => ({...p, [name]: value}));
  }, []);

  const setItemStatus = (idx: number, status: any) =>
    setFormData(p => {
      const items = [...(p.items||[])];
      items[idx] = {...items[idx], status, ...(status==='ok'||status==='original'?{notes:'',photos:[]}:{})};
      return {...p, items};
    });

  const setItemNote = (idx: number, notes: string) =>
    setFormData(p => {
      const items = [...(p.items||[])];
      items[idx] = {...items[idx], notes};
      return {...p, items};
    });

  const addItemPhoto = (idx: number, b64: string) =>
    setFormData(p => {
      const items = [...(p.items||[])];
      items[idx] = {...items[idx], photos:[...(items[idx].photos||[]),b64]};
      return {...p, items};
    });

  const removeItemPhoto = (iIdx: number, pIdx: number) =>
    setFormData(p => {
      const items = [...(p.items||[])];
      items[iIdx] = {...items[iIdx], photos: items[iIdx].photos?.filter((_,i)=>i!==pIdx)};
      return {...p, items};
    });

  const setVehiclePhoto = (field: string, b64: string) =>
    setFormData(p => ({...p, [field]: b64}));
  const removeVehiclePhoto = (field: string) =>
    setFormData(p => ({...p, [field]: undefined}));

  const save = async () => {
    if(isSaving) return; setIsSaving(true);
    try {
      const res = await fetch('/api/evaluations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formData)});
      if(res.ok) onComplete(); else show('Erro ao salvar','error');
    } catch { show('Erro de conexão','error'); }
    finally   { setIsSaving(false); }
  };

  const VPHOTO = [
    {id:'photo_front',l:'Frente'},{id:'photo_rear',l:'Traseira'},
    {id:'photo_side_right',l:'Lat. Direita'},{id:'photo_side_left',l:'Lat. Esquerda'},
    {id:'photo_dashboard',l:'Painel'},{id:'photo_seats_front',l:'Bancos Diant.'},
    {id:'photo_seats_rear',l:'Bancos Tras.'},{id:'photo_trunk',l:'Porta-malas'},
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 safe-top safe-bottom">
      <ToastContainer toasts={toasts}/>

      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="flex items-center gap-2 text-gray-500 font-bold text-sm py-2 pr-2 active:scale-95 transition-all">
          <ArrowLeft size={18}/> VOLTAR
        </button>
        <div className="flex gap-1.5">
          {[0,1,2,3].map(s=>(
            <div key={s} className={cn('w-8 md:w-14 h-1.5 rounded-full transition-all duration-500',step>=s?'bg-brand-green':'bg-gray-200')}/>
          ))}
        </div>
        <span className="text-xs font-bold text-gray-400 w-16 text-right">{step+1} / 4</span>
      </div>

      <AnimatePresence mode="wait">

        {step===0 && (
          <motion.div key="s0" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}} className="space-y-5">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black font-display tracking-tight">Qual o nível da vistoria?</h2>
              <p className="text-gray-400 mt-2 text-sm">Selecione o pacote ideal para este veículo.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {id:'simple',  name:'Essencial',desc:'Checklist básico de segurança e conservação.',         icon:Car,            border:'border-gray-100',          accent:'bg-gray-50'},
                {id:'complete',name:'Completa', desc:'Análise técnica de mecânica, elétrica e histórico.',    icon:CheckCircle2,   border:'border-brand-green/15',    accent:'bg-brand-green/5'},
                {id:'premium', name:'Premium',  desc:'Vistoria cautelar completa com análise estrutural.',    icon:LayoutDashboard,border:'border-brand-dark-green/15',accent:'bg-brand-dark-green/5'},
              ].map(pkg=>(
                <button key={pkg.id} onClick={()=>handleSelectType(pkg.id as EvaluationType)}
                  className={cn('bg-white p-7 rounded-[2rem] border-2 text-left transition-all hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] group flex flex-col items-start gap-4',pkg.border)}>
                  <div className={cn('p-4 rounded-[1.5rem] group-hover:bg-white transition-colors',pkg.accent)}>
                    <pkg.icon className="text-brand-dark-green group-hover:text-brand-green transition-colors" size={28}/>
                  </div>
                  <div>
                    <h3 className="text-xl font-black mb-1.5 tracking-tight">{pkg.name}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{pkg.desc}</p>
                    <div className="mt-5 flex items-center text-brand-green font-black text-xs tracking-widest uppercase">
                      SELECIONAR <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform"/>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step===1 && (
          <motion.div key="s1" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}
            className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-brand-border shadow-sm">
            <div className="mb-7">
              <h2 className="text-2xl font-black tracking-tight">Dados do Veículo</h2>
              <p className="text-sm text-gray-400 mt-1">Preencha as informações do cliente e do automóvel.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Nome do Cliente</label>
                <input type="text" name="client_name" autoComplete="name" autoCapitalize="words" className="input-field" placeholder="Ex: João Silva" onChange={handleInput}/>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Telefone</label>
                <input type="tel" name="client_phone" inputMode="tel" autoComplete="tel" className="input-field" placeholder="(00) 00000-0000" onChange={handleInput}/>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Placa</label>
                <input type="text" name="plate" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  className="input-field uppercase font-mono tracking-[0.15em]" placeholder="ABC1D23"
                  value={formData.plate||''} onChange={handleInput}/>
              </div>
              <div className="md:col-span-2 pt-4 border-t border-brand-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Marca</label>
                    <input type="text" name="brand" autoCapitalize="words" className="input-field" value={formData.brand||''} onChange={handleInput}/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Modelo</label>
                    <input type="text" name="model" autoCapitalize="words" className="input-field" value={formData.model||''} onChange={handleInput}/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Versão</label>
                    <input type="text" name="version" autoCapitalize="words" className="input-field" value={formData.version||''} onChange={handleInput}/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Ano Fab.</label>
                    <input type="number" name="year_fab" inputMode="numeric" className="input-field px-4" placeholder="2022" value={formData.year_fab||''} onChange={handleInput}/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Ano Mod.</label>
                    <input type="number" name="year_model" inputMode="numeric" className="input-field px-4" placeholder="2023" value={formData.year_model||''} onChange={handleInput}/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Cor</label>
                    <input type="text" name="color" autoCapitalize="words" className="input-field" value={formData.color||''} onChange={handleInput}/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">KM</label>
                    <input type="number" name="km" inputMode="numeric" className="input-field" value={formData.km||''} onChange={handleInput}/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Chassi</label>
                    <input type="text" name="chassis" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="input-field font-mono" value={formData.chassis||''} onChange={handleInput}/>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Cidade</label>
                    <input type="text" name="city" autoCapitalize="words" className="input-field" value={formData.city||''} onChange={handleInput}/>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-brand-border">
              <h3 className="text-lg font-black mb-1 tracking-tight">Galeria de Fotos</h3>
              <p className="text-xs text-gray-400 mb-5">Toque para adicionar via câmera ou galeria.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {VPHOTO.map(p=>(
                  <div key={p.id} className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-gray-400">{p.l}</label>
                    <div className="photo-upload-area">
                      {(formData as any)[p.id] ? (
                        <>
                          <img src={(formData as any)[p.id]} className="w-full h-full object-cover"/>
                          <button onClick={()=>removeVehiclePhoto(p.id)}
                            className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1 rounded-lg shadow z-10">
                            <X size={12}/>
                          </button>
                        </>
                      ) : (
                        <CameraInput onCapture={b64=>setVehiclePhoto(p.id,b64)}
                          className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-50 transition-colors">
                          <Camera size={22} className="text-gray-300"/>
                          <span className="text-[10px] text-gray-400 font-bold">ADICIONAR</span>
                        </CameraInput>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center gap-3">
              <button onClick={()=>setStep(0)} className="px-5 py-3 text-gray-400 font-bold text-sm active:scale-95">VOLTAR</button>
              <button onClick={()=>setStep(2)} className="btn-primary flex-1 md:flex-none md:px-10">PRÓXIMO</button>
            </div>
          </motion.div>
        )}

        {step===2 && (
          <motion.div key="s2" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}
            className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-brand-border shadow-sm">
            <h2 className="text-2xl font-black mb-7 tracking-tight">Checklist de Avaliação</h2>
            <div className="space-y-10">
              {Array.from(new Set(formData.items?.map(i=>i.category))).map(cat=>(
                <div key={cat}>
                  <h3 className="text-[10px] font-black uppercase text-brand-green mb-4 tracking-[0.2em] border-b border-brand-border pb-2">{cat}</h3>
                  <div className="space-y-3">
                    {formData.items?.filter(i=>i.category===cat).map(item=>{
                      const gIdx = formData.items!.findIndex(fi=>fi.item_name===item.item_name);
                      const isPremStr = type==='premium' && cat==='Estrutura Técnica';
                      const isBad     = ['compromised','problem','attention','repaired'].includes(item.status);
                      const btns = isPremStr
                        ? [{id:'original',l:'Original',c:'bg-brand-green'},{id:'repaired',l:'Reparado',c:'bg-yellow-500'},{id:'compromised',l:'Comprom.',c:'bg-red-500'}]
                        : [{id:'ok',l:'OK',c:'bg-brand-green'},{id:'attention',l:'Atenção',c:'bg-yellow-500'},{id:'problem',l:'Problema',c:'bg-red-500'}];
                      return (
                        <div key={item.item_name} className="bg-brand-gray/40 rounded-3xl overflow-hidden border border-brand-border">
                          <div className="flex flex-col p-4 gap-3">
                            <span className="font-bold text-base text-brand-black">{item.item_name}</span>
                            <div className="grid grid-cols-3 gap-2">
                              {btns.map(s=>(
                                <button key={s.id} onClick={()=>setItemStatus(gIdx,s.id)}
                                  className={cn('status-btn',item.status===s.id?`${s.c} text-white border-transparent shadow-md`:'bg-white text-gray-400 border-brand-border')}>
                                  {s.l}
                                </button>
                              ))}
                            </div>
                          </div>
                          <AnimatePresence>
                            {isBad && (
                              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                                className="px-4 pb-4 space-y-3 border-t border-brand-border pt-3">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Detalhes do Problema</label>
                                  <textarea className="w-full bg-white border border-brand-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/20 resize-none"
                                    rows={3} placeholder="Descreva o que foi identificado..."
                                    value={item.notes||''} onChange={e=>setItemNote(gIdx,e.target.value)}/>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2">Fotos da Evidência</label>
                                  <div className="flex flex-wrap gap-2">
                                    {item.photos?.map((ph,pi)=>(
                                      <div key={pi} className="relative w-16 h-16 rounded-xl overflow-hidden border border-brand-border">
                                        <img src={ph} className="w-full h-full object-cover"/>
                                        <button onClick={()=>removeItemPhoto(gIdx,pi)}
                                          className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-xl">
                                          <X size={10}/>
                                        </button>
                                      </div>
                                    ))}
                                    <CameraInput onCapture={b64=>addItemPhoto(gIdx,b64)}
                                      className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors active:scale-95">
                                      <Camera size={18}/>
                                    </CameraInput>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-between items-center gap-3">
              <button onClick={()=>setStep(1)} className="px-5 py-3 text-gray-400 font-bold text-sm active:scale-95">VOLTAR</button>
              <button onClick={()=>setStep(3)} className="btn-primary flex-1 md:flex-none md:px-10">PRÓXIMO</button>
            </div>
          </motion.div>
        )}

        {step===3 && (
          <motion.div key="s3" initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}
            className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-brand-border shadow-sm">
            <h2 className="text-2xl font-black mb-7 tracking-tight">Resultado Final</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest">Classificação do Veículo</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {id:'approved',name:'Aprovado', active:'bg-green-500 text-white',  outline:'border-green-500 text-green-500'},
                    {id:'warning', name:'Ressalvas', active:'bg-yellow-500 text-white', outline:'border-yellow-500 text-yellow-500'},
                    {id:'reproved',name:'Reprovado', active:'bg-red-500 text-white',    outline:'border-red-500 text-red-500'},
                  ].map(c=>(
                    <button key={c.id} onClick={()=>setFormData(p=>({...p,final_classification:c.id as any}))}
                      className={cn('py-4 rounded-2xl border-2 font-bold transition-all text-sm active:scale-[0.98]',
                        formData.final_classification===c.id?`${c.active} border-transparent shadow-md`:`${c.outline} border-current bg-white opacity-60`)}>
                      {c.name.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Resumo Técnico Final</label>
                <textarea name="final_summary" rows={5} className="input-field resize-none"
                  placeholder="Descreva as condições gerais observadas..." onChange={handleInput}/>
              </div>
              <div className="bg-brand-gray/50 p-5 rounded-2xl border border-brand-border">
                <p className="text-[11px] text-gray-500 leading-relaxed italic">
                  "Avaliação realizada por inspeção técnica visual e estrutural não invasiva, seguindo critérios de
                  integridade aparente, originalidade estrutural e conformidade visual. Esta avaliação não contempla
                  desmontagem de componentes, ensaios destrutivos ou testes laboratoriais."
                </p>
              </div>
              <div className="flex flex-col md:flex-row gap-3 pt-2">
                <button onClick={()=>setStep(2)} className="order-2 md:order-1 px-6 py-4 text-gray-400 font-bold text-sm active:scale-95">VOLTAR</button>
                <button onClick={save} disabled={isSaving} className="order-1 md:order-2 btn-secondary flex-1 disabled:opacity-50">
                  {isSaving?<span className="flex items-center gap-2"><RefreshCw size={16} className="animate-spin"/>SALVANDO...</span>:'SALVAR E GERAR LAUDO'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

// ─── UserManagement ───────────────────────────────────────────────────────────
const UserManagement = ({ onBack }: { onBack: () => void }) => {
  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const { toasts, show } = useToast();

  const empty = { name: '', email: '', password: '', role: 'inspector', active: 1 };
  const [form, setForm] = useState(empty);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/users');
      setUsers(await r.json());
    } catch { show('Erro ao carregar usuários', 'error'); }
    finally { setLoading(false); }
  };

  const openNew = () => { setEditing(null); setForm(empty); setShowForm(true); };
  const openEdit = (u: any) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role || 'inspector', active: u.active });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return show('Preencha nome e e-mail', 'error');
    if (!editing && !form.password) return show('Defina uma senha', 'error');
    try {
      const method = editing ? 'PUT' : 'POST';
      const url    = editing ? `/api/users/${editing.id}` : '/api/users';
      const body   = editing && !form.password
        ? { name: form.name, email: form.email, role: form.role, active: form.active }
        : form;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) return show(data.error || 'Erro ao salvar', 'error');
      show(editing ? 'Usuário atualizado!' : 'Usuário criado!');
      setShowForm(false);
      fetchUsers();
    } catch { show('Erro de conexão', 'error'); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return show(data.error || 'Erro ao excluir', 'error');
      show('Usuário excluído');
      setDeleting(null);
      fetchUsers();
    } catch { show('Erro de conexão', 'error'); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 safe-top safe-bottom">
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-3 bg-white border border-brand-border rounded-2xl active:scale-95 transition-all">
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Usuários</h1>
            <p className="text-sm text-gray-400">Gerencie inspetores e administradores</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary px-5">
          <Plus size={18} /> NOVO
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-[2.5rem] border border-brand-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 flex flex-col items-center gap-2">
            <RefreshCw size={20} className="animate-spin text-brand-green" />
            <span>Carregando...</span>
          </div>
        ) : users.map(u => (
          <div key={u.id} className="flex items-center justify-between p-5 border-b border-brand-border last:border-0">
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg',
                u.role === 'admin' ? 'bg-brand-dark-green text-brand-green' : 'bg-brand-gray text-brand-black'
              )}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold flex items-center gap-2">
                  {u.name}
                  {u.role === 'admin' && (
                    <span className="text-[10px] font-black bg-brand-dark-green text-brand-green px-2 py-0.5 rounded-full uppercase">Admin</span>
                  )}
                  {u.active === 0 && (
                    <span className="text-[10px] font-black bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full uppercase">Inativo</span>
                  )}
                </div>
                <div className="text-sm text-gray-400">{u.email}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(u)}
                className="p-2.5 text-brand-dark-green hover:bg-brand-dark-green/10 rounded-xl transition-colors active:scale-95">
                <Eye size={16} />
              </button>
              {u.id !== 1 && (
                <button onClick={() => setDeleting(u)}
                  className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-95">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
              className="bg-white rounded-[2rem] p-7 w-full max-w-sm shadow-2xl"
              style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              <h3 className="text-xl font-black mb-6">{editing ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Nome</label>
                  <input type="text" className="input-field" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">E-mail</label>
                  <input type="email" inputMode="email" className="input-field" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">
                    Senha {editing && <span className="normal-case font-normal">(deixe vazio para não alterar)</span>}
                  </label>
                  <input type="password" className="input-field" value={form.password}
                    placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Perfil</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ id: 'inspector', l: 'Inspetor' }, { id: 'admin', l: 'Admin' }].map(r => (
                      <button key={r.id} onClick={() => setForm(f => ({ ...f, role: r.id }))}
                        className={cn('py-3 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95',
                          form.role === r.id ? 'bg-brand-dark-green text-white border-transparent' : 'bg-white text-gray-400 border-brand-border')}>
                        {r.l}
                      </button>
                    ))}
                  </div>
                </div>
                {editing && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ v: 1, l: 'Ativo' }, { v: 0, l: 'Inativo' }].map(s => (
                        <button key={s.v} onClick={() => setForm(f => ({ ...f, active: s.v }))}
                          className={cn('py-3 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95',
                            form.active === s.v ? 'bg-brand-green text-white border-transparent' : 'bg-white text-gray-400 border-brand-border')}>
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-7">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl active:scale-95">
                  CANCELAR
                </button>
                <button onClick={handleSave}
                  className="flex-1 py-4 bg-brand-dark-green text-white font-bold rounded-2xl active:scale-95 shadow-lg shadow-brand-dark-green/20">
                  SALVAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete modal */}
      <AnimatePresence>
        {deleting && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center"
              style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-black mb-2">Excluir {deleting.name}?</h3>
              <p className="text-gray-500 text-sm mb-7">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleting(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl active:scale-95">CANCELAR</button>
                <button onClick={() => handleDelete(deleting.id)} className="flex-1 py-4 bg-red-500 text-white font-bold rounded-2xl active:scale-95 shadow-lg shadow-red-500/20">EXCLUIR</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User|null>(null);
  const [view, setView] = useState<'dashboard'|'new'|'users'>('dashboard');
  if (!user) return <LoginPage onLogin={setUser}/>;
  return (
    <div className="min-h-screen bg-brand-gray">
      {view==='dashboard' && (
        <Dashboard
          user={user}
          onNew={()=>setView('new')}
          onLogout={()=>setUser(null)}
          onUsers={user.role==='admin' ? ()=>setView('users') : undefined}
        />
      )}
      {view==='new' && <NewEvaluationWizard user={user} onCancel={()=>setView('dashboard')} onComplete={()=>setView('dashboard')}/>}
      {view==='users' && <UserManagement onBack={()=>setView('dashboard')}/>}
    </div>
  );
}
