import re, csv, collections, docx, sys
from grid import grid
CONV='/home/claude/conv/'
FILES=[('B1kurs1-1.docx',1,'full_time'),('B3kurs1-1.docx',3,'full_time'),('B3kurs1.docx',3,'full_time'),('B4kurs1.docx',4,'full_time'),
       ('heraka-1-kurs.docx',1,'part_time'),('heraka-2-kurs.docx',2,'part_time'),('heraka-3kurs.docx',3,'part_time'),('heraka-4-kurs.docx',4,'part_time')]
import os
if os.path.exists(CONV+'b2/html/B2.html'): FILES.insert(1,('b2/html/B2.html',2,'full_time'))
DAYS=['Mon','Tue','Wed','Thu','Fri']
TYW=r'(?:Դաս|Գործ|Լաբ|դաս|գործ|լաբ)'
TY=re.compile(r'^('+TYW+r')\.?\s?(\d?)$')
ROOM=re.compile(r'^(\d{3,5}\s?-?\s?[ա-ֆ]?|ԻՔ|ՕԼ|Ամբիոն)$')
TEACH=re.compile(r'^[^\s/\d]+\s+[Ա-Ֆ][\.,]?\s?([Ա-Ֆ][\.,]?)?$|^[Ա-Ֆ]\.([Ա-Ֆ]\.)?$')
def tokens(txt):
    out=[]
    for p in [x.strip() for x in txt.split(' / ') if x.strip()]:
        m=re.match(r'^('+TYW+r'\.?\s?\d?)\s+(.+)$',p)
        m2=re.match(r'^(.*\S)\s+('+TYW+r'\.?\s?\d?)$',p)
        if m and not TY.match(p): out+=[m.group(1),m.group(2)]
        elif m2 and not TY.match(p): out+=[m2.group(1),m2.group(2)]
        else: out.append(p)
    return out
def entries(txt):
    parts=tokens(txt); out=[]; buf=[]; i=0
    def consume(i):
        teachers=[];rooms=[]
        while i<len(parts):
            t=parts[i]
            if ROOM.match(t.replace(' ','')): rooms.append(t.replace(' ','')); i+=1
            elif TEACH.match(t):
                if re.match(r'^[Ա-Ֆ]\.([Ա-Ֆ]\.)?$',t) and teachers: teachers[-1]+=' '+t
                else: teachers.append(t)
                i+=1
            else: break
        return teachers,rooms,i
    while i<len(parts):
        t=parts[i]
        m=TY.match(t)
        if m:
            i+=1; te,ro,i=consume(i)
            out.append(dict(subject=' '.join(buf).strip(),lesson_type={'դաս':'lecture','գործ':'practical','լաբ':'lab'}[m.group(1).lower()],
                            subgroup=m.group(2),teachers=te,rooms=ro)); buf=[]
        elif not buf and (t.startswith('Կուրսային') or t.lower().startswith('ֆիզկուլտ')):
            kind='coursework' if t.startswith('Կուրսային') else 'pe'; i+=1
            if kind=='coursework' and i<len(parts) and parts[i].startswith('աշխ'): t=t+' '+parts[i]; i+=1
            te,ro,i=consume(i)
            out.append(dict(subject=t,lesson_type=kind,subgroup='',teachers=te,rooms=ro))
        else: buf.append(t); i+=1
    leftover=' '.join(buf).strip()
    return out,leftover
def split_code(code):
    c=re.sub(r'\s+','',code)
    m=re.match(r'^([Ա-Ֆ]+?)(\d)(\d\d)(.*)$',c)
    if not m: return None
    return m.group(1),m.group(2),m.group(3),m.group(4)

def html_tables(path):
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(open(path,encoding='utf-8',errors='ignore').read(),'html.parser')
    res=[]
    for tb in soup.find_all('table'):
        occupied={}; rows=[]
        for ri,tr in enumerate(tb.find_all('tr',recursive=False) or tb.find_all('tr')):
            col=0; row=[]
            for td in tr.find_all(['td','th'],recursive=False):
                while (ri,col) in occupied: 
                    row.append((col,1,'continue','')); col+=1
                cs=int(td.get('colspan',1) or 1); rs=int(td.get('rowspan',1) or 1)
                paras=[]
                for p in (td.find_all('p') or [td]):
                    t=re.sub(r'\s+',' ',p.get_text(' ',strip=True)).strip()
                    if t: paras.append(t)
                txt=' / '.join(paras)
                if rs>1:
                    for k in range(1,rs):
                        for c in range(cs): occupied[(ri+k,col+c)]=True
                row.append((col,cs,'restart' if rs>1 else None,txt)); col+=cs
            while (ri,col) in occupied:
                row.append((col,1,'continue','')); col+=1
            rows.append(row)
        res.append(rows)
    return res
def get_tables(path):
    if path.endswith('.html'): return html_tables(path)
    return [grid(path,ti) for ti in range(len(docx.Document(path).tables))]
tid={}
def teacher_id(name):
    k=re.sub(r'[\s\.]','',name)
    if k not in tid: tid[k]='T%03d'%(len(tid)+1)
    return tid[k]
lessons=[]; stats=collections.Counter(); unparsed=[]
for fname,yos,form in FILES:
    path=CONV+fname
    for tab in get_tables(path):
        blocks=[]; cur=None
        for row in tab:
            c0=row[0][3] if row else ''; c1=row[1][3].strip() if len(row)>1 else ''
            if c0 and c1.isdigit() and split_code(c0):
                cur={'code':re.sub(r'\s+','',c0),'n':int(c1),'rows':[]}; blocks.append(cur)
            elif cur is None: continue
            cur['rows'].append({col-2:(txt,vm) for col,span,vm,txt in row[2:] if (txt or vm)})
        for b in blocks:
            letters,dig,spec,suf=split_code(b['code']); rows=b['rows']
            for ri,cells in enumerate(rows):
                for s,(txt,vm) in cells.items():
                    if not txt or s<0: continue
                    per=5 if form=='part_time' else 4
                    if s>=per*5: continue
                    if form=='full_time':
                        nxt=rows[ri+1].get(s,('',None))[1] if ri+1<len(rows) else None
                        if len(rows)==1: parity='both'
                        else: parity='both' if (vm=='restart' and nxt=='continue') else ('numerator' if ri==0 else 'denominator')
                    else: parity='unknown_row%d'%ri
                    stats['cells']+=1
                    ents,left=entries(txt)
                    if not ents: stats['cells_unparsed']+=1; unparsed.append((fname,b['code'],txt[:80])); continue
                    if left: stats['cells_with_leftover']+=1
                    for e in ents:
                        stats['entries']+=1
                        lessons.append(dict(source_file=fname,study_form=form,year_of_study=yos,group_code_original=b['code'],
                            faculty_letters=letters,admission_digit=dig,specialty_code=spec,students=b['n'],row_index=ri,parity=parity,
                            weekday=DAYS[s//per],pair=s%per+1,subject=e['subject'],lesson_type=e['lesson_type'],subgroup_no=e['subgroup'],
                            teacher_ids=';'.join(teacher_id(t) for t in e['teachers']),rooms=';'.join(e['rooms'])))
print(dict(stats)); print("teachers pseudonymized:",len(tid))
print("entries with no subject:",sum(1 for l in lessons if not l['subject']),"| no teacher:",sum(1 for l in lessons if not l['teacher_ids']),"| no room:",sum(1 for l in lessons if not l['rooms']))
print("by type:",collections.Counter(l['lesson_type'] for l in lessons))
print("by file:",collections.Counter(l['source_file'] for l in lessons))
print("sample unparsed:",unparsed[:6])
with open('data/lessons_real_timetables.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(lessons[0])); w.writeheader(); w.writerows(lessons)
import pickle; pickle.dump((lessons,tid),open('lessons.pkl','wb'))
