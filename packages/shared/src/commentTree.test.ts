import { describe, expect, it } from 'vitest';
import { buildCommentTree } from './commentTree';

describe('buildCommentTree', () => {
  it('主评与 layerMainId 回复分层一致', () => {
    const t0 = new Date(0);
    const t1 = new Date(1000);
    const main = {
      id: 'm1',
      content: '层主',
      createdAt: t0,
      layerMainId: null,
      author: { username: 'alice' },
    };
    const reply = {
      id: 'r1',
      content: '回复',
      createdAt: t1,
      layerMainId: 'm1',
      author: { username: 'bob' },
    };
    const tree = buildCommentTree([reply, main]);
    expect(tree.mainComments.map((c) => c.id)).toEqual(['m1']);
    expect(tree.replyComments.map((c) => c.id)).toEqual(['r1']);
    expect(tree.layers.m1).toBe(1);
    expect(tree.layers.r1).toBe(1);
  });
});
