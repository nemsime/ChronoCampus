import re, csv, math, collections, openpyxl, docx
from grid import grid
DEAN='/home/claude/dean/'
DAYS=['Mon','Tue','Wed','Thu','Fri']
# ---------- groups from roster ----------
PROGRAMS={'Բակալ. առկա':('bachelor','full_time'),'Մագ. առկա':('master','full_time'),
          'Բակալ. հեռակա':('bachelor','part_time'),'Մագ. հեռակա':('master','part_time')}
def split_code(code):
    m=re.match(r'^(Հ?)(Մ?)(ՏՏ)(\d)(\d\d)(.*)$',code)
    return m.groups() if m else None
groups=[]
wb=openpyxl.load_workbook(DEAN+'THTE_hamakazm_10_2026.xlsx',data_only=True)
for sh,(level,form) in PROGRAMS.items():
    ws=wb[sh]
    for r in ws.iter_rows(min_row=9):
        b=r[1].value; c=r[2].value
        if not(isinstance(b,str) and split_code(b.strip())): continue
        code=b.strip(); h,m,fac,dig,spec,suf=split_code(code)
        n=int(c) if isinstance(c,(int,float)) or (isinstance(c,str) and c.isdigit()) else 0
        adm=2020+int(dig); yos=2026-adm+1
        lab=math.ceil(n/16) if n>16 else (1 if n>0 else 0)
        prac=math.ceil(n/23) if n>23 else (1 if n>0 else 0)
        groups.append(dict(group_code=code,program_level=level,study_form=form,faculty_code=fac,
            admission_digit=dig,admission_year=adm,year_of_study=yos,specialty_code=spec,suffix=suf,
            students=n,is_empty=int(n==0),lab_parts_default=lab,practical_parts_default=prac,source_sheet=sh))
with open('data/groups.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(groups[0])); w.writeheader(); w.writerows(groups)
print("groups:",len(groups),collections.Counter((g['program_level'],g['study_form']) for g in groups))
# ---------- rooms + occupancy ----------
def parse_room_code(code):
    suf=re.sub(r'[\d]','',code).replace('-','')
    d=re.sub(r'\D','',code)
    note=''
    if len(d)==4: b,f,r=d[0],d[1],d[2:]
    elif len(d)==5:
        if d[:2] in ('10','11','12','13','14','15','16','17'): b,f,r=d[:2],d[2],d[3:]; note='5-digit code starting with 1x parsed as 2-digit building'
        else: b,f,r=d[0],d[1:3],d[3:]
    else: b=f=r=''; note='unparsed'
    return b,f,r,suf,note
TTFAM=re.compile(r'^[ՀՄ]*ՏՏ\d{3}')
def codes_of(t): return [x.strip() for x in re.split(r'\s*/\s*|\s{2,}',t) if x.strip() and not x.strip().startswith('...')]
rooms=[]; occ=[]
def room_tables(path,source):
    d=docx.Document(path)
    for ti in range(len(d.tables)):
        cur=None
        for row in grid(path,ti):
            c0=row[0][3] if row else ''
            if c0 and re.match(r'^(\d{3,5}|ՕԼ)',c0.replace(' ','')) and not re.match(r'^\d+[\.․]\d+$',c0.strip()):
                cap=row[1][3].strip() if len(row)>1 else ''
                cur={'code':c0.replace(' ',''),'cap':int(cap) if cap.isdigit() else None,'rows':[],'source':source}
                rooms.append(cur)
            elif cur is None: continue
            cur['rows'].append({col-2:(txt,vm) for col,span,vm,txt in row[2:] if (txt or vm)})
room_tables(DEAN+'LAB1.14.docx','LAB1.14.docx'); room_tables(DEAN+'out/5.docx','5.doc')
seen=set(); room_rows=[]
for r in rooms:
    if r['code'] in seen: continue
    seen.add(r['code'])
    b,fl,rm,suf,note=parse_room_code(r['code'])
    cap=r['cap']; typ='unknown' if not cap else ('small_or_lab' if cap<=18 else ('classroom' if cap<=45 else 'lecture_hall'))
    room_rows.append(dict(room_code=r['code'],building=b,floor=fl,room_on_floor=rm,suffix=suf,capacity=cap if cap else '',
        room_type_guess=typ,week_rows=len(r['rows']),source_file=r['source'],parse_note=note))
with open('data/rooms.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(room_rows[0])); w.writeheader(); w.writerows(room_rows)
print("rooms:",len(room_rows),"with capacity:",sum(1 for r in room_rows if r['capacity']!=''))
# occupancy with parity
for r in rooms:
    rows=r['rows']
    # drop trailing empty-only rows is fine; parity: first row numerator, later rows denominator
    for ri,cells in enumerate(rows):
        for s,(txt,vm) in cells.items():
            if not txt: continue
            if s<0 or s>=20: continue
            if len(rows)==1: parity='both'
            else:
                nxt=rows[ri+1].get(s,('',None))[1] if ri+1<len(rows) else None
                parity='both' if (vm=='restart' and nxt=='continue') else ('numerator' if ri==0 else 'denominator')
            cs=codes_of(txt)
            occ.append(dict(room_code=r['code'],weekday=DAYS[s//4],pair=s%4+1,parity=parity,raw=txt.replace('\n',' '),
                group_codes=';'.join(cs),n_groups=len(cs),
                is_tt_family=int(all(TTFAM.match(c) for c in cs)) if cs else 0,
                source_file=r['source']))
# dedupe identical rows (rooms repeated in two files)
uniq={ (o['room_code'],o['weekday'],o['pair'],o['parity'],o['raw']):o for o in occ}
occ=list(uniq.values())
with open('data/room_occupancy.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(occ[0])); w.writeheader(); w.writerows(occ)
ext=[o for o in occ if not o['is_tt_family']]
with open('data/external_room_blocks.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(occ[0])); w.writeheader(); w.writerows(ext)
print("occupancy rows:",len(occ),"| external/other-institute blocks:",len(ext),"| parity:",collections.Counter(o['parity'] for o in occ))
