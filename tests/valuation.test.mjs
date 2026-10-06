import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSales,validDate} from '../public/valuation.js';
const now=new Date('2026-10-06T12:00:00Z');
const sale=(extra={})=>({date:'2026-09-01',price:100,currency:'USD',match:'exact',url:'https://example.com/sale',sale_id:'1',...extra});
test('never mixes currencies, context matches, or old sales into recent exact ranges',()=>{
 const r=summarizeSales([sale(),sale({sale_id:'2',price:200,currency:'CAD'}),sale({sale_id:'3',price:900,match:'context'}),sale({sale_id:'4',date:'2025-01-01',price:800})],now);
 assert.deepEqual(r.groups,[{currency:'USD',count:1,low:100,high:100},{currency:'CAD',count:1,low:200,high:200}]);assert.equal(r.sales.length,4);
});
test('deduplicates the same marketplace sale across sources',()=>{const r=summarizeSales([sale(),sale({url:'https://example.com/other'})],now);assert.equal(r.duplicates,1);assert.equal(r.sales.length,1);});
test('rejects impossible and future dates and nonpositive prices',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(summarizeSales([sale({date:'2027-01-01'}),sale({price:0})],now).invalid,2);});
