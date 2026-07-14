/** Numbered section heading — "LAYER 03 · Agricultural Knowledge Engine". */
export const SectionHead = ({ num, title }: { num: string; title: string }) => (
  <div className="sec-head">
    <span className="sec-num">{num}</span>
    <h2>{title}</h2>
  </div>
);
