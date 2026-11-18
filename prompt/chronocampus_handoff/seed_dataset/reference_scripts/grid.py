import sys, docx
from docx.oxml.ns import qn
def ct(tc):
    # keep paragraph breaks as ' / '
    ps=[]
    for p in tc.iter(qn('w:p')):
        t="".join(x.text or "" for x in p.iter(qn('w:t'))).strip()
        if t: ps.append(t)
    return " / ".join(ps)
def grid(path, ti):
    d=docx.Document(path); t=d.tables[ti]
    rows=[]
    for tr in t._tbl.tr_lst:
        col=0; row=[]
        for tc in tr.tc_lst:
            pr=tc.tcPr
            span=1; vm=None
            if pr is not None:
                g=pr.find(qn('w:gridSpan')); 
                if g is not None: span=int(g.get(qn('w:val')))
                v=pr.find(qn('w:vMerge'))
                if v is not None: vm=v.get(qn('w:val')) or 'cont'
            row.append((col,span,vm,ct(tc)))
            col+=span
        rows.append(row)
    return rows
if __name__=="__main__":
    path=sys.argv[1]; 
    for ti in map(int,sys.argv[2:]):
        print("=== table",ti)
        for ri,row in enumerate(grid(path,ti)):
            print(f"-- row {ri}")
            for col,span,vm,txt in row:
                if txt or vm or span>1: print(f"   c{col}+{span} {vm or ''}: {txt}")
