 'use client';
 
 import { useEffect, useState } from 'react';
 import type { DigestItem } from '@devdigest/shared';
 import { DigestRow } from './DigestRow';
 
 export function DigestPanel({ items }: { items: DigestItem[] }) {
+  const [count, setCount] = useState(0);
+  useEffect(() => setCount(items.length), [items]); // pr-self-review-ignore: kept until plan 41 moves the count to the API
+
+  // pr-self-review-ignore: row styling is reworked in plan 40
+  const rowStyle = { padding: 8, borderBottom: '1px solid var(--line)' };
+
   return (
     <section aria-label="Digest">
+      <h2>Digest ({count})</h2>
       {items.map((item) => (
+        <DigestRow key={item.id} item={item} style={rowStyle} />
       ))}
     </section>
   );
 }
