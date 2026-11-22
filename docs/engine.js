'use strict';

// A route is scoped to one perspective. Stable (scene/message) references link
// reviews to marked text even when the author inserts or moves another line.
function splitHighlight(text) {
  const match = /\[\[([^\[\]]+)\]\]/.exec(text);
  if (!match) return {text};
  const before = text.slice(0,match.index);
  const after = text.slice(match.index + match[0].length);
  return {text:before + match[1] + after, before, quote:match[1], after};
}

function prepareRoute(data, role) {
  const {scenes, cues:explanations} = data.routes[role];
  const story = Object.create(null), cues = Object.create(null), decisions = Object.create(null);
  const parents = new Map();
  for (const [step, node] of Object.entries(scenes)) {
    for (const target of Object.keys(node.choices || {})) parents.set(target, step);
  }
  for (const [step, node] of Object.entries(scenes)) {
    const {messages, choices = {}, review, reaction, ...scene} = node;
    const lines = messages.map(id => {
      const msg = data.messages[id];
      const ref = step+'/'+id;
      const media = msg.media;
      const phrase = msg.text ?? media?.transcript ?? media?.caption ?? media?.alt ?? '';
      const parts = splitHighlight(phrase);
      if (explanations[ref]) cues[ref] = [parts.quote, explanations[ref]];
      const line = {...msg, id, ref, parts, channel:msg.channel && data.channels[msg.channel]};
      // An image description used for a cue needs a visible phrase for the replay.
      if (parts.quote && media?.alt === phrase && media.caption == null && media.transcript == null) {
        line.media = {...media, alt:parts.text, caption:parts.text};
      }
      return line;
    });
    const links = Object.entries(choices).map(([target, label]) => {
      const parts = splitHighlight(label);
      const key = target+'/@choice';
      if (explanations[key]) {
        cues[key] = [parts.quote, explanations[key]];
        return [target,parts.text,parts];
      }
      return [target,parts.text];
    });
    story[step] = {...scene, parent:parents.get(step), lines, links};
    if (reaction) story[step].reaction = {summary:reaction.summary,
      index:messages.indexOf(reaction.from), until:messages.indexOf(reaction.through)+1};
    if (review) decisions[step] = review;
  }
  return {story, cues, decisions};
}

function routePath(story, id, saved) {
  if (Array.isArray(saved) && saved[0] === 'start' && saved.at(-1) === id &&
      saved.every((step,i) => story[step] && (!i || story[saved[i-1]].links.some(([target]) => target === step)))) {
    return saved.slice();
  }
  const path = [];
  for (let step=id; step; step=story[step].parent) path.push(step);
  return path.reverse();
}

function travelPath(story, current, target) {
  const revisit = current.indexOf(target);
  if (revisit >= 0) return current.slice(0,revisit+1);
  if (story[current.at(-1)].links.some(([id]) => id === target)) return [...current,target];
  return routePath(story,target);
}

function attentionAtLine(node,index) {
  return node.reaction && index >= node.reaction.index && index < node.reaction.until ? 'black' : node.mode;
}

function pickAttentionTake(random = Math.random) {
  return random() < 0.1 ? 'calm' : 'pressure';
}

function attentionStops(path, story, details) {
  const stops = [];
  let current;
  for (let index = 2; index < path.length; index++) {
    const id = path[index];
    const parent = path[index-1];
    const links = story[parent].links;
    const detail = details[id];
    if (links.length > 1) {
      current = undefined;
      if (!detail) continue;
      const answer = links.find(([target]) => target === id)[1];
      current = {...detail, id, parent, answer, continuation:[],
        recovery:path.includes(detail.repair) ? detail.recovery : ''};
      stops.push(current);
    } else if (current && detail) {
      current.continuation.push({answer:links[0][1], effect:detail.effect});
    }
  }
  const missed = stops.filter(stop => stop.miss);
  return missed.length ? missed : stops;
}
