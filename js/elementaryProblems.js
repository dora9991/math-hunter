// 暗算しやすい短文・一行の小学生向け問題。答えは0〜99の整数。
const p=(text,answer,topic,wrong=[],pre='')=>({text,answer,topic,wrong,pre});
export const ELEMENTARY_TOPICS={basicadd:'小学生：たし算・ひき算',tables:'小学生：九九・わり算',blank:'小学生：□を求める',measure:'小学生：長さ・時間',money:'小学生：お金',shape:'小学生：面積・周りの長さ',fraction:'小学生：分数・割合',sequence:'小学生：数の並び',compare:'小学生：数の大小'};
export const ELEMENTARY={
 add(r){const a=r.int(2,29),b=r.int(2,29);return p(`${a} ＋ ${b}`,a+b,'basicadd',[a+b+1,a+b-1,Math.abs(a-b)]);},
 subtract(r){const b=r.int(2,24),a=b+r.int(1,29);return p(`${a} − ${b}`,a-b,'basicadd',[a+b,a-b+1,b]);},
 tables(r){const a=r.int(2,9),b=r.int(2,9);return p(`${a} × ${b}`,a*b,'tables',[a+b,a*(b+1),a*b-1]);},
 divide(r){const b=r.int(2,9),a=r.int(2,9);return p(`${a*b} ÷ ${b}`,a,'tables',[b,a+1,a*b-b]);},
 blank(r){const x=r.int(2,18),b=r.int(2,19);return p(`□ ＋ ${b} ＝ ${x+b}`,x,'blank',[x+b,x+1,b],'□ は？');},
 multiplyBlank(r){const x=r.int(2,9),b=r.int(2,9);return p(`${b} × □ ＝ ${x*b}`,x,'blank',[b,x*b-b,x+1],'□ は？');},
 minutes(r){const n=r.int(1,9),m=r.chance(.5)?5:0;return p(`${n*10}分 ＋ ${m}分`,n*10+m,'measure');},
 clock(r){const h=r.int(1,12),d=r.int(1,5);return p(`${h}時の${d}時間後は？`,h+d,'measure',[h-d,h+d+1,d],'答えは「時」の数字');},
 length(r){const n=r.int(1,9);return p(`${n}cm は何mm？`,n*10,'measure',[n,n+10,n*10+1]);},
 money(r){const paid=r.int(3,9)*10,cost=r.int(1,paid/10-1)*10;return p(`${paid}円で${cost}円の買い物`,paid-cost,'money',[paid+cost,cost,paid-cost+10],'おつりは何円？');},
 area(r){const a=r.int(2,9),b=r.int(2,9);return p(`たて${a}cm・横${b}cm`,a*b,'shape',[a+b,2*(a+b),a*b+1],'長方形の面積は何cm²？');},
 perimeter(r){const n=r.int(2,15);return p(`1辺${n}cmの正方形`,n*4,'shape',[n*n,n*2,n+4],'周りの長さは何cm？');},
 fraction(r){const d=r.int(2,5),a=r.int(2,16);return p(`${a*d}の${d}分の1は？`,a,'fraction',[d,a*d-d,a+1]);},
 percent(r){const n=r.int(1,9)*10;return p(`${n}の10%は？`,n/10,'fraction',[n-10,n/10+1,n/10*2]);},
 sequence(r){const a=r.int(1,9),d=r.int(2,8);return p(`${a}, ${a+d}, ${a+d*2}, □`,a+d*3,'sequence',[a+d*4,a+d*2+1,a+d*2],'同じ数ずつ増える。□ は？');},
 compare(r){const a=r.int(10,49),b=a+r.int(1,29);return p(`${a} と ${b}`,b,'compare',[a,b+1,a+1],'大きい数は？');},
};
// 既存の移動問題は中学生向けでは符号を保ち、小学生向けでは正の数だけで選べる。
export function elementaryProblem(kind,r){
 const pool=kind==='left'||kind==='right'?['add','subtract','clock','length','sequence']:
 kind==='big'?['blank','multiplyBlank','area','perimeter','fraction']:
 kind==='heal'?['money','length','clock','fraction','percent']:
 kind.startsWith('dodge')?['add','subtract','tables','divide','compare']:Object.keys(ELEMENTARY);
 return {...ELEMENTARY[pool[r.int(0,pool.length-1)]](r),elementary:true};
}
