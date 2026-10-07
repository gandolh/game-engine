//#region src/style.css?inline
var e = ".hollow-root,.hollow-root *{box-sizing:border-box;margin:0;padding:0}.hollow-root{width:100%;height:100%;font-family:monospace;position:relative;overflow:hidden}.hollow-root canvas.hollow-scene{width:100%;height:100%;display:block}.hollow-root #hollow-left-rail{flex-direction:column;width:380px;max-width:42%;font-size:12px;display:flex;position:absolute;top:0;bottom:0;left:0;overflow:hidden}.hollow-root .hollow-chronicle-panel{flex-direction:column;flex:45%;min-height:0;padding:8px;display:flex}.hollow-root .hollow-chronicle-title{flex:none;margin-bottom:4px;font-size:14px}.hollow-root .hollow-chronicle-filters{flex-wrap:wrap;flex:none;gap:4px;margin-bottom:6px;display:flex}.hollow-root .hollow-chronicle-chip{cursor:pointer;border:none;border-radius:3px;flex:none;padding:2px 6px;font-family:inherit;font-size:10px}.hollow-root .hollow-chronicle-list{flex-direction:column;flex:auto;gap:2px;min-height:0;display:flex;overflow-y:auto}.hollow-root .hollow-chronicle-row{flex:none;padding:2px 6px;font-size:11px;line-height:1.4}.hollow-root .hollow-dashboard-panel{flex-direction:column;flex:55%;gap:4px;min-height:0;padding:8px;display:flex;overflow-y:auto}.hollow-root .hollow-dashboard-title{flex:none;margin-bottom:4px;font-size:14px}.hollow-root .hollow-dashboard-chart{flex:none;margin-bottom:8px}.hollow-root .hollow-dashboard-chart-title{margin-bottom:2px;font-size:11px}.hollow-root .hollow-dashboard-canvas{width:100%;height:70px;display:block}.hollow-root .hollow-dashboard-legend{flex-wrap:wrap;gap:6px;margin-top:2px;font-size:10px;display:flex}.hollow-root .hollow-dashboard-legend-swatch{border-radius:50%;width:8px;height:8px;margin-right:2px;display:inline-block}.hollow-root .hollow-export-panel{flex:none;gap:6px;padding:8px;display:flex}.hollow-root .hollow-export-button{cursor:pointer;border:none;border-radius:3px;flex:1 1 0;padding:4px;font-family:inherit;font-size:10px}.hollow-root #hollow-director-bar{flex-direction:column;gap:2px;max-width:46%;font-size:11px;display:flex;position:absolute;top:0;right:0}.hollow-root .hollow-director-bar-row{align-items:center;gap:6px;display:flex}.hollow-root .hollow-time-control-panel{align-items:center;gap:6px;padding:6px 8px;display:flex}.hollow-root .hollow-time-control-button{cursor:pointer;border:none;border-radius:3px;padding:4px 8px;font-family:inherit;font-size:11px}.hollow-root .hollow-time-control-button:disabled{cursor:default;opacity:.5}.hollow-root .hollow-time-control-speed-group{gap:2px;display:flex}.hollow-root .hollow-time-control-speed-button{cursor:pointer;border:none;border-radius:3px;padding:4px 6px;font-family:inherit;font-size:10px}.hollow-root .hollow-share-button{cursor:pointer;border:none;border-radius:3px;padding:4px 10px;font-family:inherit;font-size:11px}.hollow-root .hollow-shock-panel{flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;display:flex}.hollow-root .hollow-shock-kind-group{gap:2px;display:flex}.hollow-root .hollow-shock-kind-button{cursor:pointer;border:none;border-radius:3px;padding:4px 8px;font-family:inherit;font-size:10px}.hollow-root .hollow-shock-row{align-items:center;gap:4px;font-size:10px;display:flex}.hollow-root .hollow-shock-row input,.hollow-root .hollow-shock-row select{width:64px;font-family:inherit;font-size:10px}.hollow-root .hollow-shock-fire-button{cursor:pointer;border:none;border-radius:3px;padding:4px 10px;font-family:inherit;font-size:11px}.hollow-root .hollow-setup-panel{z-index:10;padding:24px 24px 48px;font-size:13px;position:absolute;inset:0;overflow-y:auto}.hollow-root .hollow-setup-title{margin-bottom:4px;font-size:22px}.hollow-root .hollow-setup-subtitle{max-width:640px;margin-bottom:16px;font-size:12px}.hollow-root .hollow-setup-section{margin-bottom:16px}.hollow-root .hollow-setup-section-title{margin-bottom:6px;font-size:13px}.hollow-root .hollow-setup-row{align-items:center;gap:8px;margin-bottom:4px;display:flex}.hollow-root .hollow-setup-label{flex:0 0 152px}.hollow-root .hollow-setup-archetype-row{padding:8px 0}.hollow-root .hollow-setup-archetype-header{align-items:center;gap:8px;display:flex}.hollow-root .hollow-setup-archetype-label{min-width:100px;font-weight:700}.hollow-root .hollow-setup-tune-btn,.hollow-root .hollow-setup-randomize-btn,.hollow-root .hollow-setup-start-btn{cursor:pointer;border:none;border-radius:3px;padding:6px 10px;font-family:inherit;font-size:12px}.hollow-root .hollow-setup-start-btn{margin-top:12px;padding:10px 20px;font-size:14px;position:sticky;bottom:8px}.hollow-root .hollow-setup-gene-panel{flex-direction:column;gap:4px;padding:8px 0 8px 16px;display:flex}.hollow-root .hollow-setup-gene-row{align-items:center;gap:8px;display:flex}.hollow-root .hollow-setup-gene-label{min-width:130px}.hollow-root .hollow-setup-gene-value{min-width:40px;display:inline-block}.hollow-root .hollow-setup-lock-label{align-items:center;gap:2px;font-size:10px;display:flex}";
//#endregion
//#region ../../../engine/core/src/render3d/geometry.ts
function t(e, t) {
	return [
		e[0] + t[0],
		e[1] + t[1],
		e[2] + t[2]
	];
}
function n(e, t) {
	return [
		e[0] - t[0],
		e[1] - t[1],
		e[2] - t[2]
	];
}
function r(e, t) {
	return [
		e[1] * t[2] - e[2] * t[1],
		e[2] * t[0] - e[0] * t[2],
		e[0] * t[1] - e[1] * t[0]
	];
}
function i(e, t) {
	return e[0] * t[0] + e[1] * t[1] + e[2] * t[2];
}
function a(e) {
	let t = Math.hypot(e[0], e[1], e[2]);
	return t === 0 ? [
		0,
		0,
		0
	] : [
		e[0] / t,
		e[1] / t,
		e[2] / t
	];
}
function o(e, n) {
	return {
		positions: e.positions.map((e) => t(e, n)),
		tris: e.tris
	};
}
function s(e, t) {
	let n = typeof t == "number" ? [
		t,
		t,
		t
	] : t;
	return {
		positions: e.positions.map((e) => [
			e[0] * n[0],
			e[1] * n[1],
			e[2] * n[2]
		]),
		tris: e.tris
	};
}
function c(e, t) {
	let n = Math.cos(t), r = Math.sin(t);
	return {
		positions: e.positions.map((e) => [
			e[0] * n + e[2] * r,
			e[1],
			-e[0] * r + e[2] * n
		]),
		tris: e.tris
	};
}
function l(...e) {
	let t = [], n = [];
	for (let r of e) {
		let e = t.length;
		for (let e of r.positions) t.push(e);
		for (let t of r.tris) n.push({
			a: t.a + e,
			b: t.b + e,
			c: t.c + e,
			material: t.material
		});
	}
	return {
		positions: t,
		tris: n
	};
}
function u(e) {
	if (e.positions.length === 0) return {
		min: [
			0,
			0,
			0
		],
		max: [
			0,
			0,
			0
		]
	};
	let t = Infinity, n = Infinity, r = Infinity, i = -Infinity, a = -Infinity, o = -Infinity;
	for (let [s, c, l] of e.positions) s < t && (t = s), c < n && (n = c), l < r && (r = l), s > i && (i = s), c > a && (a = c), l > o && (o = l);
	return {
		min: [
			t,
			n,
			r
		],
		max: [
			i,
			a,
			o
		]
	};
}
function d(e, t, n, r, i) {
	return {
		positions: [
			e,
			t,
			n,
			r
		],
		tris: [{
			a: 0,
			b: 1,
			c: 2,
			material: i
		}, {
			a: 0,
			b: 2,
			c: 3,
			material: i
		}]
	};
}
function f(e, t) {
	let [n, r, i] = e, a = [
		[
			0,
			0,
			0
		],
		[
			n,
			0,
			0
		],
		[
			n,
			r,
			0
		],
		[
			0,
			r,
			0
		],
		[
			0,
			0,
			i
		],
		[
			n,
			0,
			i
		],
		[
			n,
			r,
			i
		],
		[
			0,
			r,
			i
		]
	], o = (e, n, r, i) => [{
		a: e,
		b: n,
		c: r,
		material: t
	}, {
		a: e,
		b: r,
		c: i,
		material: t
	}];
	return {
		positions: a,
		tris: [
			...o(4, 5, 6, 7),
			...o(0, 3, 2, 1),
			...o(1, 2, 6, 5),
			...o(0, 4, 7, 3),
			...o(3, 7, 6, 2),
			...o(0, 1, 5, 4)
		]
	};
}
function p(e, t, n) {
	let r = [];
	for (let i = 0; i < n; i++) {
		let a = i / n * Math.PI * 2;
		r.push([
			Math.cos(a) * e,
			Math.sin(a) * e,
			t
		]);
	}
	return r;
}
function m(e, t, n, r) {
	let i = p(e, 0, n), a = p(e, t, n), o = [...i, ...a], s = o.push([
		0,
		0,
		t
	]) - 1, c = o.push([
		0,
		0,
		0
	]) - 1, l = [];
	for (let e = 0; e < n; e++) {
		let t = (e + 1) % n, i = e, a = t, o = n + e, u = n + t;
		l.push({
			a: i,
			b: a,
			c: u,
			material: r
		}), l.push({
			a: i,
			b: u,
			c: o,
			material: r
		}), l.push({
			a: s,
			b: o,
			c: u,
			material: r
		}), l.push({
			a: c,
			b: a,
			c: i,
			material: r
		});
	}
	return {
		positions: o,
		tris: l
	};
}
function h(e, t, n, r) {
	let i = [...p(e, 0, n)], a = i.push([
		0,
		0,
		t
	]) - 1, o = i.push([
		0,
		0,
		0
	]) - 1, s = [];
	for (let e = 0; e < n; e++) {
		let t = (e + 1) % n;
		s.push({
			a: e,
			b: t,
			c: a,
			material: r
		}), s.push({
			a: o,
			b: t,
			c: e,
			material: r
		});
	}
	return {
		positions: i,
		tris: s
	};
}
function g(e, t, n) {
	let [r, i, a] = e;
	if (t === "x") {
		let e = i / 2;
		return {
			positions: [
				[
					0,
					0,
					0
				],
				[
					r,
					0,
					0
				],
				[
					r,
					i,
					0
				],
				[
					0,
					i,
					0
				],
				[
					0,
					e,
					a
				],
				[
					r,
					e,
					a
				]
			],
			tris: [
				{
					a: 3,
					b: 4,
					c: 5,
					material: n
				},
				{
					a: 3,
					b: 5,
					c: 2,
					material: n
				},
				{
					a: 1,
					b: 5,
					c: 4,
					material: n
				},
				{
					a: 1,
					b: 4,
					c: 0,
					material: n
				},
				{
					a: 1,
					b: 2,
					c: 5,
					material: n
				},
				{
					a: 0,
					b: 4,
					c: 3,
					material: n
				},
				{
					a: 0,
					b: 3,
					c: 2,
					material: n
				},
				{
					a: 0,
					b: 2,
					c: 1,
					material: n
				}
			]
		};
	}
	let o = r / 2;
	return {
		positions: [
			[
				0,
				0,
				0
			],
			[
				r,
				0,
				0
			],
			[
				r,
				i,
				0
			],
			[
				0,
				i,
				0
			],
			[
				o,
				0,
				a
			],
			[
				o,
				i,
				a
			]
		],
		tris: [
			{
				a: 1,
				b: 2,
				c: 5,
				material: n
			},
			{
				a: 1,
				b: 5,
				c: 4,
				material: n
			},
			{
				a: 0,
				b: 4,
				c: 5,
				material: n
			},
			{
				a: 0,
				b: 5,
				c: 3,
				material: n
			},
			{
				a: 2,
				b: 3,
				c: 5,
				material: n
			},
			{
				a: 0,
				b: 1,
				c: 4,
				material: n
			},
			{
				a: 0,
				b: 3,
				c: 2,
				material: n
			},
			{
				a: 0,
				b: 2,
				c: 1,
				material: n
			}
		]
	};
}
//#endregion
//#region ../../../engine/core/src/render3d/mat4.ts
function _() {
	return new Float32Array([
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1
	]);
}
function v(e, t) {
	let n = new Float32Array(16);
	for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
		let a = 0;
		for (let n = 0; n < 4; n++) a += e[n * 4 + i] * t[r * 4 + n];
		n[r * 4 + i] = a;
	}
	return n;
}
function y(e, t, n, r) {
	let i = 1 / Math.tan(e / 2), a = 1 / (n - r), o = new Float32Array(16);
	return o[0] = i / t, o[5] = i, o[10] = r * a, o[11] = -1, o[14] = r * n * a, o;
}
function b(e, t, o) {
	let s = a(n(e, t)), c = a(r(o, s));
	c[0] === 0 && c[1] === 0 && c[2] === 0 && (c = a(r([
		0,
		0,
		1
	], s)));
	let l = r(s, c), u = new Float32Array(16);
	return u[0] = c[0], u[1] = l[0], u[2] = s[0], u[3] = 0, u[4] = c[1], u[5] = l[1], u[6] = s[1], u[7] = 0, u[8] = c[2], u[9] = l[2], u[10] = s[2], u[11] = 0, u[12] = -i(c, e), u[13] = -i(l, e), u[14] = -i(s, e), u[15] = 1, u;
}
function x(e) {
	let t = _();
	return t[12] = e[0], t[13] = e[1], t[14] = e[2], t;
}
function S(e) {
	let t = _();
	return t[0] = e[0], t[5] = e[1], t[10] = e[2], t;
}
function C(e) {
	let t = Math.cos(e), n = Math.sin(e), r = _();
	return r[0] = t, r[1] = n, r[4] = -n, r[5] = t, r;
}
function w(e) {
	let t = e[0], n = e[1], r = e[2], i = e[3], a = e[4], o = e[5], s = e[6], c = e[7], l = e[8], u = e[9], d = e[10], f = e[11], p = e[12], m = e[13], h = e[14], g = e[15], v = t * o - n * a, y = t * s - r * a, b = t * c - i * a, x = n * s - r * o, S = n * c - i * o, C = r * c - i * s, w = l * m - u * p, T = l * h - d * p, E = l * g - f * p, D = u * h - d * m, O = u * g - f * m, k = d * g - f * h, A = v * k - y * O + b * D + x * E - S * T + C * w;
	if (Math.abs(A) < 1e-12) return _();
	let j = 1 / A, M = new Float32Array(16);
	return M[0] = (o * k - s * O + c * D) * j, M[1] = (r * O - n * k - i * D) * j, M[2] = (m * C - h * S + g * x) * j, M[3] = (d * S - u * C - f * x) * j, M[4] = (s * E - a * k - c * T) * j, M[5] = (t * k - r * E + i * T) * j, M[6] = (h * b - p * C - g * y) * j, M[7] = (l * C - d * b + f * y) * j, M[8] = (a * O - o * E + c * w) * j, M[9] = (n * E - t * O - i * w) * j, M[10] = (p * S - m * b + g * v) * j, M[11] = (u * b - l * S - f * v) * j, M[12] = (o * T - a * D - s * w) * j, M[13] = (t * D - n * T + r * w) * j, M[14] = (m * y - p * x - h * v) * j, M[15] = (l * x - u * y + d * v) * j, M;
}
function T(e, t) {
	let n = t[0], r = t[1], i = t[2], a = e[0] * n + e[4] * r + e[8] * i + e[12], o = e[1] * n + e[5] * r + e[9] * i + e[13], s = e[2] * n + e[6] * r + e[10] * i + e[14], c = e[3] * n + e[7] * r + e[11] * i + e[15];
	if (c === 0) return [
		a,
		o,
		s
	];
	let l = 1 / c;
	return [
		a * l,
		o * l,
		s * l
	];
}
//#endregion
//#region ../../../engine/core/src/render3d/camera3d.ts
var E = [
	0,
	0,
	1
];
function D(e, t) {
	return [
		e[0] * t,
		e[1] * t,
		e[2] * t
	];
}
function O(e, t, n) {
	return Math.min(n, Math.max(t, e));
}
var k = class {
	target;
	distance;
	yaw;
	pitch;
	fovy;
	near;
	far;
	minPitch;
	maxPitch;
	minDistance;
	maxDistance;
	constructor(e) {
		this.target = e.target, this.distance = O(e.distance, e.minDistance, e.maxDistance), this.yaw = e.yaw, this.pitch = O(e.pitch, e.minPitch, e.maxPitch), this.fovy = e.fovy, this.near = e.near, this.far = e.far, this.minPitch = e.minPitch, this.maxPitch = e.maxPitch, this.minDistance = e.minDistance, this.maxDistance = e.maxDistance;
	}
	direction() {
		let e = Math.cos(this.pitch), t = Math.sin(this.pitch), n = Math.cos(this.yaw), r = Math.sin(this.yaw);
		return [
			e * n,
			e * r,
			t
		];
	}
	orbit(e, t) {
		this.yaw += e, this.pitch = O(this.pitch + t, this.minPitch, this.maxPitch);
	}
	pan(e, n) {
		let i = this.direction(), o = a(r(E, i));
		o[0] === 0 && o[1] === 0 && o[2] === 0 && (o = [
			1,
			0,
			0
		]);
		let s = r(i, o);
		this.target = t(this.target, t(D(o, e), D(s, n)));
	}
	zoom(e) {
		this.distance = O(this.distance * e, this.minDistance, this.maxDistance);
	}
	eye() {
		return t(this.target, D(this.direction(), this.distance));
	}
	viewMatrix() {
		return b(this.eye(), this.target, E);
	}
	projMatrix(e) {
		return y(this.fovy, e, this.near, this.far);
	}
};
//#endregion
//#region ../../../engine/core/src/render3d/pick.ts
function A(e, t, r, i, o) {
	let s = e / r * 2 - 1, c = 1 - t / i * 2, l = w(o), u = T(l, [
		s,
		c,
		0
	]);
	return {
		origin: u,
		dir: a(n(T(l, [
			s,
			c,
			1
		]), u))
	};
}
function j(e, t, n) {
	let r = -Infinity, i = Infinity;
	for (let a = 0; a < 3; a++) {
		let o = e.origin[a], s = e.dir[a], c = t[a], l = n[a];
		if (Math.abs(s) < 1e-12) {
			if (o < c || o > l) return null;
			continue;
		}
		let u = 1 / s, d = (c - o) * u, f = (l - o) * u;
		if (d > f) {
			let e = d;
			d = f, f = e;
		}
		if (d > r && (r = d), f < i && (i = f), r > i) return null;
	}
	return i < 0 ? null : r >= 0 ? r : i;
}
function M(e, t) {
	let n = Infinity, r = null;
	for (let i of t) {
		let t = j(e, i.bounds.min, i.bounds.max);
		t !== null && t < n && (n = t, r = i.value);
	}
	return r;
}
function ee(e) {
	let t = /* @__PURE__ */ new Map();
	return e.forEach((e, n) => {
		t.has(e) || t.set(e, n);
	}), (e) => {
		let n = t.get(e);
		if (n === void 0) throw Error(`render3d: unknown material key "${e}" — not present in the ordered key list passed to materialIndexMap (must match the array given to setMaterials)`);
		return n;
	};
}
function N(e, t) {
	let n = e.positions.length, r = new Float32Array(n * 4);
	for (let t = 0; t < n; t++) {
		let n = e.positions[t], i = t * 4;
		r[i + 0] = n[0], r[i + 1] = n[1], r[i + 2] = n[2];
	}
	let i = new Uint8Array(n), a = new Uint32Array(e.tris.length * 3), o = 0;
	for (let n of e.tris) {
		let e = t(n.material);
		for (let t of [
			n.a,
			n.b,
			n.c
		]) i[t] === 0 && (r[t * 4 + 3] = e, i[t] = 1), a[o++] = t;
	}
	return {
		vertices: r,
		indices: a,
		vertexCount: n,
		indexCount: a.length
	};
}
function te(e, t, n, r) {
	e.set(n, t), e[t + 16] = r[0], e[t + 17] = r[1], e[t + 18] = r[2], e[t + 19] = r[3];
}
function P(e) {
	let t = new Float32Array(e.length * 20);
	return e.forEach((e, n) => {
		te(t, n * 20, e.model, e.tint);
	}), t;
}
function ne(e) {
	let t = new Float32Array(e.length * 4);
	return e.forEach((e, n) => {
		let r = n * 4;
		t[r + 0] = e.color[0], t[r + 1] = e.color[1], t[r + 2] = e.color[2], t[r + 3] = +!!e.emissive;
	}), t;
}
function re(e, t) {
	let { min: n, max: r } = u(e), i = [
		[
			n[0],
			n[1],
			n[2]
		],
		[
			r[0],
			n[1],
			n[2]
		],
		[
			n[0],
			r[1],
			n[2]
		],
		[
			r[0],
			r[1],
			n[2]
		],
		[
			n[0],
			n[1],
			r[2]
		],
		[
			r[0],
			n[1],
			r[2]
		],
		[
			n[0],
			r[1],
			r[2]
		],
		[
			r[0],
			r[1],
			r[2]
		]
	], a = Infinity, o = Infinity, s = Infinity, c = -Infinity, l = -Infinity, d = -Infinity;
	for (let e of i) {
		let n = T(t, e);
		n[0] < a && (a = n[0]), n[1] < o && (o = n[1]), n[2] < s && (s = n[2]), n[0] > c && (c = n[0]), n[1] > l && (l = n[1]), n[2] > d && (d = n[2]);
	}
	return {
		min: [
			a,
			o,
			s
		],
		max: [
			c,
			l,
			d
		]
	};
}
function F() {
	let e = typeof window < "u" && window.devicePixelRatio || 1;
	return Math.min(e, 2);
}
//#endregion
//#region ../../../engine/core/src/render/webgl2/gl-context.ts
var I = {
	alpha: !1,
	antialias: !1,
	depth: !1,
	stencil: !1,
	premultipliedAlpha: !0,
	preserveDrawingBuffer: !1,
	powerPreference: "high-performance"
}, L = class e {
	gl;
	canvas;
	_lost = !1;
	_lostHandlers = /* @__PURE__ */ new Set();
	_restoredHandlers = /* @__PURE__ */ new Set();
	_handleContextLost;
	_handleContextRestored;
	constructor(e, t) {
		this.gl = e, this.canvas = t, this._handleContextLost = (e) => {
			e.preventDefault(), this._lost = !0;
			for (let e of this._lostHandlers) e();
		}, this._handleContextRestored = () => {
			this._lost = !1;
			for (let e of this._restoredHandlers) e();
		}, t.addEventListener("webglcontextlost", this._handleContextLost, !1), t.addEventListener("webglcontextrestored", this._handleContextRestored, !1);
	}
	static create(t, n) {
		let r = {
			...I,
			depth: n?.depth ?? !1
		}, i = t.getContext("webgl2", r);
		if (!i) throw Error("webgl2: context unavailable");
		return new e(i, t);
	}
	resize(e, t) {
		let n = F(), r = Math.max(1, Math.floor(e * n)), i = Math.max(1, Math.floor(t * n));
		(this.canvas.width !== r || this.canvas.height !== i) && (this.canvas.width = r, this.canvas.height = i), this._lost || this.gl.viewport(0, 0, r, i);
	}
	isLost() {
		return this._lost;
	}
	onContextLost(e) {
		return this._lostHandlers.add(e), () => this._lostHandlers.delete(e);
	}
	onContextRestored(e) {
		return this._restoredHandlers.add(e), () => this._restoredHandlers.delete(e);
	}
	dispose() {
		this.canvas.removeEventListener("webglcontextlost", this._handleContextLost, !1), this.canvas.removeEventListener("webglcontextrestored", this._handleContextRestored, !1), this.gl.getExtension("WEBGL_lose_context")?.loseContext(), this._lostHandlers.clear(), this._restoredHandlers.clear();
	}
};
function ie(e, t) {
	return L.create(e, t);
}
//#endregion
//#region ../../../engine/core/src/render3d/webgl2/device3d.ts
var ae = class e {
	gl;
	canvas;
	glContext;
	maxUniformBlockSize;
	constructor(e, t) {
		this.glContext = e, this.gl = e.gl, this.canvas = e.canvas, this.maxUniformBlockSize = t;
	}
	get lost() {
		return this.glContext.isLost();
	}
	static create(t) {
		let n;
		try {
			n = ie(t, { depth: !0 });
		} catch (e) {
			let t = e instanceof Error ? e.message : String(e);
			throw Error(`render3d: webgl2 context unavailable (WebGL2 not supported in this browser): ${t}`);
		}
		let r = n.gl;
		r.enable(r.DEPTH_TEST), r.enable(r.CULL_FACE);
		let i = r.getParameter(r.MAX_UNIFORM_BLOCK_SIZE);
		return new e(n, i);
	}
};
function oe(e) {
	return ae.create(e);
}
//#endregion
//#region ../../../engine/core/src/render/webgl2/program.ts
function se(e, t, n, r) {
	let i = ce(e, e.VERTEX_SHADER, t, r, "vertex"), a = ce(e, e.FRAGMENT_SHADER, n, r, "fragment"), o = e.createProgram();
	if (!o) throw e.deleteShader(i), e.deleteShader(a), Error(`webgl2: gl.createProgram() returned null for program "${r}"`);
	if (e.attachShader(o, i), e.attachShader(o, a), e.linkProgram(o), !e.getProgramParameter(o, e.LINK_STATUS)) {
		let s = e.getProgramInfoLog(o) ?? "(no program info log)";
		throw e.deleteProgram(o), e.deleteShader(i), e.deleteShader(a), Error(`webgl2: program "${r}" failed to link:\n${s}\n\n--- vertex source (${r}) ---\n${R(t)}\n\n--- fragment source (${r}) ---\n${R(n)}`);
	}
	return e.deleteShader(i), e.deleteShader(a), o;
}
function ce(e, t, n, r, i) {
	let a = e.createShader(t);
	if (!a) throw Error(`webgl2: gl.createShader() returned null for ${i} shader "${r}"`);
	if (e.shaderSource(a, n), e.compileShader(a), !e.getShaderParameter(a, e.COMPILE_STATUS)) {
		let t = e.getShaderInfoLog(a) ?? "(no shader info log)";
		throw e.deleteShader(a), Error(`webgl2: ${i} shader "${r}" failed to compile:\n${t}\n\n--- source (${r}, ${i}) ---\n${R(n)}`);
	}
	return a;
}
function R(e) {
	return e.split("\n").map((e, t) => `${String(t + 1).padStart(4, " ")} | ${e}`).join("\n");
}
function le(e, t, n) {
	let r = {};
	for (let i of n) r[i] = e.getUniformLocation(t, i);
	return r;
}
function ue(e, t) {
	e.enableVertexAttribArray(t.location), e.vertexAttribPointer(t.location, t.size, t.type, t.normalized ?? !1, t.stride, t.offset), t.divisor && e.vertexAttribDivisor(t.location, t.divisor);
}
function de(e, t) {
	let n = e.createVertexArray();
	if (!n) throw Error("webgl2: gl.createVertexArray() returned null");
	return e.bindVertexArray(n), t(e), e.bindVertexArray(null), n;
}
//#endregion
//#region ../../../engine/core/src/render3d/webgl2/pipeline-cache.ts
var fe = 3, pe = class {
	gl;
	cache = /* @__PURE__ */ new Map();
	constructor(e) {
		this.gl = e;
	}
	getOrCreate(e, t = fe) {
		let n = this.cache.get(t);
		if (n) return n;
		let r = this._build(e);
		return this.cache.set(t, r), r;
	}
	_build(e) {
		let t = this.gl, n = se(t, e.vert, e.frag, "scene3d");
		return {
			program: n,
			uniforms: le(t, n, e.uniformNames),
			vertexAttribs: [{
				location: 0,
				size: 3,
				type: t.FLOAT,
				stride: 16,
				offset: 0
			}, {
				location: 1,
				size: 1,
				type: t.FLOAT,
				stride: 16,
				offset: 12
			}],
			instanceAttribs: [
				{
					location: 2,
					size: 4,
					type: t.FLOAT,
					stride: 80,
					offset: 0,
					divisor: 1
				},
				{
					location: 3,
					size: 4,
					type: t.FLOAT,
					stride: 80,
					offset: 16,
					divisor: 1
				},
				{
					location: 4,
					size: 4,
					type: t.FLOAT,
					stride: 80,
					offset: 32,
					divisor: 1
				},
				{
					location: 5,
					size: 4,
					type: t.FLOAT,
					stride: 80,
					offset: 48,
					divisor: 1
				},
				{
					location: 6,
					size: 4,
					type: t.FLOAT,
					stride: 80,
					offset: 64,
					divisor: 1
				}
			]
		};
	}
};
//#endregion
//#region ../../../engine/core/src/render3d/webgl2/gl-buffers.ts
function me(e, t, n, r) {
	let i = e.createBuffer();
	if (!i) throw Error("webgl2: gl.createBuffer() returned null");
	return e.bindBuffer(t, i), e.bufferData(t, n, r), e.bindBuffer(t, null), i;
}
function he(e, t, n = e.STATIC_DRAW) {
	return me(e, e.ARRAY_BUFFER, t, n);
}
function ge(e, t, n = e.STATIC_DRAW) {
	return me(e, e.ELEMENT_ARRAY_BUFFER, t, n);
}
function _e(e, t, n = e.DYNAMIC_DRAW) {
	return me(e, e.UNIFORM_BUFFER, t, n);
}
//#endregion
//#region ../../../engine/core/src/render3d/webgl2/shaders/scene3d.vert.glsl?raw
var ve = "#version 300 es\n\n// scene3d.vert.glsl — WebGL2/GLSL ES 3.00 port of ../../webgpu/shaders/scene3d.wgsl's\n// vs_main. Attribute locations are FIXED by ../pipeline-cache.ts (mechanically derived\n// from ../../buffers.ts's packing contract, itself owned by brief 10/11) — this file\n// declares matching layout(location = N) qualifiers; it does not choose the numbers.\n//\n// The one deliberate change from the WGSL original: clip-space depth convention.\n// ../../mat4.ts's perspective() targets WebGPU/D3D's z in [0,1] clip-space range\n// (shared code, must not change — see its own header). WebGL2's rasterizer expects\n// OpenGL's z in [-1,1] range. The remap happens HERE, on gl_Position, rather than in\n// mat4.ts: the standard \"zero-to-one -> negative-one-to-one\" fixup is\n// z' = z*2 - w (equivalent to 2*(z/w) - 1 after the perspective divide, but applied\n// pre-divide so interpolation stays perspective-correct). Left uncorrected, near/far\n// ordering stays monotonic (so nothing renders \"inside out\"), but only the top half\n// of the GL depth buffer's range would ever be used, wasting precision — this fixup\n// restores full use of the buffer.\n\nlayout(std140) uniform Frame {\n  mat4 viewProj;\n  vec3 sunDir;\n  float dayNight;\n  float ambient;\n  float time;\n} frame;\n\nlayout(location = 0) in vec3 a_position;\nlayout(location = 1) in float a_materialIndex;\nlayout(location = 2) in vec4 a_modelCol0;\nlayout(location = 3) in vec4 a_modelCol1;\nlayout(location = 4) in vec4 a_modelCol2;\nlayout(location = 5) in vec4 a_modelCol3;\nlayout(location = 6) in vec4 a_tint;\n\nout vec3 v_worldPos;\nflat out uint v_materialIndex;\nout vec4 v_tint;\n\nvoid main() {\n  mat4 model = mat4(a_modelCol0, a_modelCol1, a_modelCol2, a_modelCol3);\n  vec4 worldPos = model * vec4(a_position, 1.0);\n  vec4 clipPosition = frame.viewProj * worldPos;\n\n  // WebGPU/D3D clip-space z in [0,1] -> GL clip-space z in [-1,1]. See this\n  // file's header for why the fixup lives here and not in the shared mat4.ts.\n  gl_Position = vec4(clipPosition.xy, clipPosition.z * 2.0 - clipPosition.w, clipPosition.w);\n\n  v_worldPos = worldPos.xyz;\n  v_materialIndex = uint(a_materialIndex);\n  v_tint = a_tint;\n}\n", ye = "#version 300 es\nprecision highp float;\n\n// scene3d.frag.glsl — WebGL2/GLSL ES 3.00 port of ../../webgpu/shaders/scene3d.wgsl's\n// fs_main. Preserves its cozy lighting model exactly: half-Lambert diffuse with a\n// shadow floor so no face is ever crushed to black, a cheap hemispheric \"AO-ish\"\n// ambient boost for upward-facing normals, a night dim floor, and an emissive\n// override for glowing windows. See the WGSL original for the full design\n// rationale — the comments below carry it over where the logic is unchanged.\n//\n// Flat shading: derived PER-FACE from screen-space derivatives of world position\n// (dFdx/dFdy — core in GLSL ES 3.00, no extension needed), mirroring exactly what\n// the WGSL original does with dpdx/dpdy. This is NOT a `flat`-qualified normal\n// varying and NOT per-vertex normals — no per-vertex normal data is packed\n// anywhere in this pipeline (see ../../buffers.ts's FLOATS_PER_VERTEX), so this is\n// the only option that matches the existing vertex layout, and it is what the\n// original relies on too.\n//\n// WebGL2-specific change from the WGSL original: `materials` was an UNBOUNDED\n// storage buffer (`var<storage, read> materials: array<MaterialEntry>`) — WebGL2\n// has no storage buffers, so this becomes a fixed-size std140 uniform block.\n// MAX_MATERIALS is injected as a `#define` by renderer3d.ts immediately after the\n// `#version` line above (see its `injectMaxMaterials` helper) — the source of\n// truth is renderer3d.ts's `MAX_MATERIALS` constant, checked against the device's\n// MAX_UNIFORM_BLOCK_SIZE at construction. Do not hardcode a number here.\n// FLOATS_PER_MATERIAL (../../buffers.ts) is exactly 4 floats — one vec4 per\n// entry, which is precisely std140's array stride for vec4, so packMaterials'\n// Float32Array uploads unchanged: no repacking, no padding.\n\nin vec3 v_worldPos;\nflat in uint v_materialIndex;\nin vec4 v_tint;\n\nlayout(std140) uniform Frame {\n  mat4 viewProj;\n  vec3 sunDir;\n  float dayNight;\n  float ambient;\n  float time;\n} frame;\n\nlayout(std140) uniform Materials {\n  vec4 entries[MAX_MATERIALS];\n} materials;\n\nout vec4 o_color;\n\nvoid main() {\n  vec4 entry = materials.entries[v_materialIndex];\n  vec3 base = entry.rgb;\n  float emissive = entry.a;\n\n  vec3 faceNormal = normalize(cross(dFdx(v_worldPos), dFdy(v_worldPos)));\n\n  // Smooth wrapped (\"half-Lambert\") diffuse instead of a hard toon ramp: the raw\n  // dot in [-1,1] is remapped to [0,1] and softened, so light falls off GRADUALLY\n  // across every face (no banding) and faces angled away from the sun still get a\n  // gentle gradient rather than snapping to a flat shadow band. A shadow FLOOR\n  // then lifts the darkest faces to a cozy dim — this is what guarantees every\n  // surface stays readable, whatever its orientation.\n  float ndl = dot(faceNormal, normalize(frame.sunDir));\n  float wrapped = ndl * 0.5 + 0.5;\n  float diffuse = wrapped * wrapped;\n  float shadowFloor = 0.45;\n  float shade = mix(shadowFloor, 1.0, diffuse);\n\n  // Cheap hemispheric \"AO-ish\" ambient term: upward-facing faces (roofs,\n  // ground) read a touch brighter than vertical walls, at zero extra cost.\n  // Added ON TOP of the directional term so shadowed sides never fall to black.\n  float upFactor = 0.5 + 0.5 * clamp(faceNormal.z, 0.0, 1.0);\n  float ambientTerm = frame.ambient * upFactor;\n\n  // Night dims the DIRECTIONAL term toward a lifted floor (never 0) as\n  // dayNight -> 0, for a cozy dim night rather than a black-out. Ambient is\n  // applied outside this so even full night keeps every surface readable.\n  float nightFloor = 0.35;\n  float dayFactor = mix(nightFloor, 1.0, frame.dayNight);\n\n  vec3 lit = base * (shade * dayFactor + ambientTerm);\n\n  if (emissive > 0.5) {\n    // Emissive surfaces (glowing windows) ignore lighting entirely and\n    // brighten as night falls, so they read as light sources after dusk.\n    float glowBoost = mix(1.6, 1.0, frame.dayNight);\n    lit = base * glowBoost;\n  }\n\n  lit = lit * v_tint.rgb;\n\n  o_color = vec4(lit, v_tint.a);\n}\n", be = 0, xe = 1, Se = 4294967295, Ce = 24;
function we(e) {
	let t = e.split("\n");
	return t.splice(1, 0, "#define MAX_MATERIALS 256"), t.join("\n");
}
var Te = {
	vert: we(ve),
	frag: we(ye),
	uniformNames: []
}, Ee = class {
	indexCount;
	vao;
	vertexBuffer;
	indexBuffer;
	constructor(e, t, n, r) {
		this.vao = e, this.vertexBuffer = t, this.indexBuffer = n, this.indexCount = r;
	}
}, De = class {
	gl;
	device3d;
	pipeline;
	clearColor;
	frameScratch = new Float32Array(Ce);
	frameBuffer;
	materialsBuffer;
	materialsSet = !1;
	instanceBuffers = /* @__PURE__ */ new Map();
	constructor(e, t = {}) {
		this.device3d = e, this.gl = e.gl, this.clearColor = t.clearColor ?? [
			0,
			0,
			0,
			0
		];
		let n = 256 * 4 * 4;
		if (e.maxUniformBlockSize < n) throw Error(`render3d: MAX_MATERIALS (256) needs a ${n}-byte uniform block, but this device's MAX_UNIFORM_BLOCK_SIZE is only ${e.maxUniformBlockSize} bytes (WebGL2 guarantees >= 16384). Lower MAX_MATERIALS in renderer3d.ts.`);
		let r = this.gl, i = new pe(r);
		this.pipeline = i.getOrCreate(Te), r.frontFace(r.CCW), r.cullFace(r.BACK), r.depthFunc(r.LESS), r.depthMask(!0), this._bindUniformBlock("Frame", be), this._bindUniformBlock("Materials", xe), this.frameBuffer = _e(r, Ce * 4, r.DYNAMIC_DRAW), this.materialsBuffer = _e(r, n, r.DYNAMIC_DRAW), r.bindBufferBase(r.UNIFORM_BUFFER, be, this.frameBuffer), r.bindBufferBase(r.UNIFORM_BUFFER, xe, this.materialsBuffer);
	}
	_bindUniformBlock(e, t) {
		let n = this.gl, r = n.getUniformBlockIndex(this.pipeline.program, e);
		if (r === Se) throw Error(`render3d: uniform block "${e}" not found in the scene3d program`);
		n.uniformBlockBinding(this.pipeline.program, r, t);
	}
	setMaterials(e) {
		if (e.length > 256) throw Error(`render3d: setMaterials received ${e.length} materials, exceeding MAX_MATERIALS (256). The WebGL2 materials table is a fixed-size uniform block, not an unbounded storage buffer — either shrink the material table or raise MAX_MATERIALS in renderer3d.ts (checked against maxUniformBlockSize at construction).`);
		let t = this.gl, n = ne(e);
		t.bindBuffer(t.UNIFORM_BUFFER, this.materialsBuffer), t.bufferSubData(t.UNIFORM_BUFFER, 0, n), t.bindBuffer(t.UNIFORM_BUFFER, null), this.materialsSet = !0;
	}
	uploadMesh(e, t) {
		let n = this.gl, r = N(e, t), i = he(n, r.vertices), a = ge(n, r.indices);
		return new Ee(de(n, () => {
			n.bindBuffer(n.ARRAY_BUFFER, i);
			for (let e of this.pipeline.vertexAttribs) ue(n, e);
			n.bindBuffer(n.ELEMENT_ARRAY_BUFFER, a);
		}), i, a, r.indexCount);
	}
	resizeDevicePixels(e, t) {
		this.device3d.lost || this.gl.viewport(0, 0, Math.max(1, e), Math.max(1, t));
	}
	render(e) {
		if (this.device3d.lost) return;
		if (!this.materialsSet) throw Error("render3d: SceneRenderer3D.render called before setMaterials");
		let t = this.gl;
		this._writeFrameUniform(e), t.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]), t.clearDepth(1), t.clear(t.COLOR_BUFFER_BIT | t.DEPTH_BUFFER_BIT), t.useProgram(this.pipeline.program);
		for (let n of e.draws) {
			if (n.instanceCount === 0) continue;
			let e = this._instanceBufferFor(n.mesh, n.instances);
			t.bindVertexArray(n.mesh.vao), t.bindBuffer(t.ARRAY_BUFFER, e);
			for (let e of this.pipeline.instanceAttribs) ue(t, e);
			t.drawElementsInstanced(t.TRIANGLES, n.mesh.indexCount, t.UNSIGNED_INT, 0, n.instanceCount);
		}
		t.bindVertexArray(null);
	}
	_writeFrameUniform(e) {
		let t = this.gl, n = this.frameScratch;
		n.set(e.viewProj, 0), n[16] = e.sunDir[0], n[17] = e.sunDir[1], n[18] = e.sunDir[2], n[20] = e.dayNight, n[21] = e.ambient, n[22] = e.time, t.bindBuffer(t.UNIFORM_BUFFER, this.frameBuffer), t.bufferSubData(t.UNIFORM_BUFFER, 0, n), t.bindBuffer(t.UNIFORM_BUFFER, null);
	}
	_instanceBufferFor(e, t) {
		let n = this.gl, r = Math.max(t.byteLength, 80), i = this.instanceBuffers.get(e);
		return (!i || i.capacityBytes < r) && (i = {
			buffer: he(n, r, n.DYNAMIC_DRAW),
			capacityBytes: r
		}, this.instanceBuffers.set(e, i)), n.bindBuffer(n.ARRAY_BUFFER, i.buffer), n.bufferSubData(n.ARRAY_BUFFER, 0, t), n.bindBuffer(n.ARRAY_BUFFER, null), i.buffer;
	}
};
//#endregion
//#region ../../../engine/core/src/sim/day-cycle.ts
function Oe(e) {
	let t = (1 + Math.cos(2 * Math.PI * e)) / 2;
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function ke(e) {
	return 1 - Oe(e);
}
//#endregion
//#region ../../../engine/core/src/render/palette.ts
var Ae = /* @__PURE__ */ "#be4a2f.#d77643.#ead4aa.#e4a672.#b86f50.#733e39.#3e2731.#a22633.#e43b44.#f77622.#feae34.#fee761.#63c74d.#3e8948.#265c42.#193c3e.#124e89.#0099db.#2ce8f5.#ffffff.#c0cbdc.#8b9bb4.#5a6988.#3a4466.#262b44.#181425.#ff0044.#68386c.#b55088.#f6757a.#e8b796.#c28569".split("."), je = {
	rust: "#be4a2f",
	clay: "#d77643",
	cream: "#ead4aa",
	tan: "#e4a672",
	wood: "#b86f50",
	woodDark: "#733e39",
	bark: "#3e2731",
	crimson: "#a22633",
	red: "#e43b44",
	orange: "#f77622",
	gold: "#feae34",
	yellow: "#fee761",
	green: "#63c74d",
	greenMid: "#3e8948",
	greenDark: "#265c42",
	teal: "#193c3e",
	blue: "#124e89",
	skyBlue: "#0099db",
	cyan: "#2ce8f5",
	white: "#ffffff",
	silver: "#c0cbdc",
	steel: "#8b9bb4",
	slate: "#5a6988",
	navy: "#3a4466",
	ink: "#262b44",
	black: "#181425",
	hotPink: "#ff0044",
	plum: "#68386c",
	mauve: "#b55088",
	salmon: "#f6757a",
	skin: "#e8b796",
	skinMid: "#c28569"
};
new Set(Ae);
function Me(e) {
	let t = e.trim().toLowerCase();
	return t.startsWith("#") && (t = t.slice(1)), t.length === 3 && (t = t.split("").map((e) => e + e).join("")), `#${t}`;
}
function Ne(e) {
	let t = Me(e).slice(1), n = parseInt(t, 16);
	return [
		n >> 16 & 255,
		n >> 8 & 255,
		n & 255
	];
}
new Set(/* @__PURE__ */ "#172038.#253a5e.#3c5e8b.#4f8fba.#73bed3.#a4dddb.#19332d.#25562e.#468232.#75a743.#a8ca58.#d0da91.#4d2b32.#7a4841.#ad7757.#c09473.#d7b594.#e7d5b3.#341c27.#602c2c.#884b2b.#be772b.#de9e41.#e8c170.#241527.#411d31.#752438.#a53030.#cf573c.#da863e.#1e1d39.#402751.#7a367b.#a23e8c.#c65197.#df84a5.#090a14.#10141f.#151d28.#202e37.#394a50.#577277.#819796.#a8b5b2.#c7cfcc.#ebede9".split(".")), new Set(/* @__PURE__ */ "#2e222f.#3e3546.#625565.#966c6c.#ab947a.#694f62.#7f708a.#9babb2.#c7dcd0.#ffffff.#6e2727.#b33831.#ea4f36.#f57d4a.#ae2334.#e83b3b.#fb6b1d.#f79617.#f9c22b.#7a3045.#9e4539.#cd683d.#e6904e.#fbb954.#4c3e24.#676633.#a2a947.#d5e04b.#fbff86.#165a4c.#239063.#1ebc73.#91db69.#cddf6c.#313638.#374e4a.#547e64.#92a984.#b2ba90.#0b5e65.#0b8a8f.#0eaf9b.#30e1b9.#8ff8e2.#323353.#484a77.#4d65b4.#4d9be6.#8fd3ff.#45293f.#6b3e75.#905ea9.#a884f3.#eaaded.#753c54.#a24b6f.#cf657f.#ed8099.#831c5d.#c32454.#f04f78.#f68181.#fca790.#fdcbb0".split("."));
//#endregion
//#region ../../../engine/core/src/render/unsupported-notice.ts
var Pe = "This game needs WebGL2, which could not be started.\n\nWebGL2 ships in every current browser, so the usual cause is that hardware acceleration is switched off, or that this is a virtual machine or remote session without a usable GPU.\n\nTry enabling hardware acceleration in your browser settings, then reload.";
function Fe(e, t, n = Pe, r = "engine-renderer-unavailable") {
	if (typeof document > "u" || document.getElementById(r)) return;
	let i = document.createElement("div");
	i.id = r, i.textContent = n, i.style.position = "fixed", i.style.top = "50%", i.style.left = "50%", i.style.transform = "translate(-50%, -50%)", i.style.maxWidth = "34rem", i.style.padding = "18px 22px", i.style.textAlign = "left", i.style.whiteSpace = "pre-line", i.style.font = "14px/1.6 ui-monospace, monospace", i.style.color = t.text, i.style.background = t.background, i.style.border = `1px solid ${t.border}`, i.style.borderRadius = "6px", i.style.zIndex = "50", i.style.pointerEvents = "none", e.appendChild(i);
}
//#endregion
//#region ../../../engine/core/src/render/snapshot-interp.ts
function Ie(e, t, n) {
	return e + (t - e) * n;
}
function Le(e) {
	return e < 0 ? 0 : e > 1 ? 1 : e;
}
function Re(e, t, n, r = 0) {
	return n <= 0 ? 1 : Le((e - t - r) / n);
}
function ze(e, t, n) {
	let r = Le(n), i = /* @__PURE__ */ new Map();
	for (let t of e) i.set(t.id, t);
	let a = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = i.get(e.id);
		if (t === void 0) {
			a.set(e.id, {
				x: e.x,
				y: e.y
			});
			continue;
		}
		a.set(e.id, {
			x: Ie(t.x, e.x, r),
			y: Ie(t.y, e.y, r)
		});
	}
	return a;
}
var Be = class {
	prevEntities = null;
	latestEntities = null;
	latestAtMs = 0;
	intervalMs;
	constructor(e) {
		this.intervalMs = e;
	}
	ingest(e, t) {
		if (this.latestEntities !== null) {
			this.prevEntities = this.latestEntities;
			let e = t - this.latestAtMs;
			e > 0 && (this.intervalMs = e);
		}
		this.latestEntities = e, this.latestAtMs = t;
	}
	reset() {
		this.prevEntities = null, this.latestEntities = null;
	}
	getLatest() {
		return this.latestEntities;
	}
	getPrev() {
		return this.prevEntities;
	}
	alpha(e, t = 0) {
		return this.prevEntities === null || this.latestEntities === null ? 1 : Re(e, this.latestAtMs, this.intervalMs, t);
	}
	interpolatedPositions(e, t = 0) {
		let n = this.latestEntities;
		return n === null ? /* @__PURE__ */ new Map() : this.prevEntities === null ? new Map(n.map((e) => [e.id, {
			x: e.x,
			y: e.y
		}])) : ze(this.prevEntities, n, this.alpha(e, t));
	}
}, Ve = {
	"top-left": "top: 8px;left: 8px",
	"top-right": "top: 8px;right: 8px",
	"bottom-left": "bottom: 8px;left: 8px",
	"bottom-right": "bottom: 8px;right: 8px"
}, He = class {
	element;
	lastWallMs = performance.now();
	frameCount = 0;
	fps = 0;
	accumulatedMs = 0;
	frameMs = 0;
	workerReport = null;
	frameReport = null;
	lastTick = 0;
	lastEntityCount = 0;
	constructor(e, t) {
		let n = t?.corner ?? "top-left", r = document.createElement("div");
		r.style.cssText = [
			"position: absolute",
			Ve[n],
			"padding: 6px 8px",
			"font: 12px/1.4 ui-monospace, monospace",
			`color: ${je.silver}`,
			"background: rgba(24, 20, 37, 0.55)",
			"border: 1px solid rgba(255, 255, 255, 0.08)",
			"border-radius: 4px",
			"pointer-events: none",
			"white-space: pre"
		].join(";"), e.appendChild(r), this.element = r;
	}
	update(e) {
		this.lastTick = e.tick, this.lastEntityCount = e.entityCount;
		let t = performance.now(), n = t - this.lastWallMs;
		this.lastWallMs = t, this.accumulatedMs += n, this.frameCount += 1, this.frameMs = this.frameMs === 0 ? n : this.frameMs * .9 + n * .1, this.accumulatedMs >= 500 && (this.fps = this.frameCount * 1e3 / this.accumulatedMs, this.frameCount = 0, this.accumulatedMs = 0);
		let r = `fps   ${this.fps.toFixed(1)}\nms    ${this.frameMs.toFixed(1)}\ntick  ${e.tick}\nalpha ${e.alpha.toFixed(3)}\nents  ${e.entityCount}`, i = (e, t, n, r) => {
			let i = t?.[n];
			return i === void 0 ? "" : r === "kb" ? `\n${e} ${(i.mean / 1024).toFixed(1)}KB` : `\n${e} ${i.mean.toFixed(2)}/${i.p95.toFixed(2)}ms`;
		};
		(this.workerReport !== null || this.frameReport !== null) && (r += "\n— mean/p95 —", r += i("tick ", this.workerReport, "tick", "ms"), r += i("snap ", this.workerReport, "snapshot.build", "ms"), r += i("snapKB", this.workerReport, "snapshot.bytes", "kb"), r += i("frame", this.frameReport, "frame", "ms"), r += i("interp", this.frameReport, "interp", "ms")), this.element.textContent = r;
	}
	exportReport() {
		return {
			fps: this.fps,
			frameMs: this.frameMs,
			tick: this.lastTick,
			entityCount: this.lastEntityCount,
			worker: this.workerReport,
			frame: this.frameReport
		};
	}
	setVisible(e) {
		this.element.style.display = e ? "" : "none";
	}
	setWorkerReport(e) {
		this.workerReport = e;
	}
	setFrameReport(e) {
		this.frameReport = e;
	}
	destroy() {
		this.element.remove();
	}
}, Ue = 240, We = class {
	enabled;
	capacity;
	rings = /* @__PURE__ */ new Map();
	scratch;
	constructor(e = {}) {
		this.enabled = e.enabled ?? !1, this.capacity = e.capacity ?? Ue, this.scratch = new Float64Array(this.capacity);
	}
	add(e, t) {
		if (!this.enabled) return;
		let n = this.rings.get(e);
		n === void 0 && (n = {
			buf: new Float64Array(this.capacity),
			head: 0,
			size: 0,
			total: 0,
			last: 0
		}, this.rings.set(e, n)), n.buf[n.head] = t, n.head = (n.head + 1) % this.capacity, n.size < this.capacity && (n.size += 1), n.total += 1, n.last = t;
	}
	time(e, t) {
		if (!this.enabled) return t();
		let n = performance.now(), r = t();
		return this.add(e, performance.now() - n), r;
	}
	stats(e) {
		let t = this.rings.get(e);
		if (t === void 0 || t.size === 0) return null;
		let n = t.size, r = 0, i = Infinity, a = -Infinity;
		for (let e = 0; e < n; e += 1) {
			let n = t.buf[e];
			r += n, n < i && (i = n), n > a && (a = n), this.scratch[e] = n;
		}
		let o = this.scratch.subarray(0, n);
		o.sort();
		let s = o[Math.min(n - 1, Math.floor(n * .5))], c = o[Math.min(n - 1, Math.floor(n * .95))];
		return {
			count: t.total,
			mean: r / n,
			min: i,
			max: a,
			p50: s,
			p95: c,
			last: t.last
		};
	}
	report() {
		let e = {};
		for (let t of this.rings.keys()) {
			let n = this.stats(t);
			n !== null && (e[t] = n);
		}
		return e;
	}
	reset() {
		this.rings.clear();
	}
}, z = {
	rust: "#cf573c",
	clay: "#be772b",
	cream: "#e7d5b3",
	tan: "#e8c170",
	wood: "#ad7757",
	woodDark: "#7a4841",
	bark: "#4d2b32",
	crimson: "#752438",
	red: "#a53030",
	orange: "#da863e",
	gold: "#de9e41",
	yellow: "#e8c170",
	green: "#75a743",
	greenMid: "#468232",
	greenDark: "#25562e",
	teal: "#19332d",
	blue: "#3c5e8b",
	skyBlue: "#4f8fba",
	cyan: "#73bed3",
	white: "#ebede9",
	silver: "#c7cfcc",
	steel: "#819796",
	slate: "#577277",
	navy: "#202e37",
	ink: "#151d28",
	black: "#090a14",
	hotPink: "#c65197",
	plum: "#7a367b",
	mauve: "#a23e8c",
	salmon: "#df84a5",
	skin: "#d7b594",
	skinMid: "#c09473",
	skinLight: "#e7d5b3",
	skinDark: "#ad7757",
	skinDeep: "#7a4841",
	hairBlack: "#090a14",
	hairBrown: "#4d2b32",
	hairBlonde: "#e8c170",
	hairRed: "#da863e",
	hairGrey: "#577277"
}, Ge = [
	{
		phase: "commute",
		start: 0,
		end: .15
	},
	{
		phase: "work",
		start: .15,
		end: .7
	},
	{
		phase: "gather",
		start: .7,
		end: .9
	},
	{
		phase: "sleep",
		start: .9,
		end: 1
	}
], Ke = {
	phase: "commute",
	dayOfRun: 0,
	fractionThroughPhase: 0
};
function qe(e, t) {
	if (!(t > 0) || !Number.isFinite(t)) return Ke;
	let n = Math.floor(e / t), r = (e - n * t) / t, i = Ge.length - 1;
	for (let e = 0; e <= i; e++) {
		let t = Ge[e];
		if (r < t.end || e === i) {
			let e = t.end - t.start, i = e > 0 ? (r - t.start) / e : 0, a = Math.min(1, Math.max(0, i));
			return {
				phase: t.phase,
				dayOfRun: n,
				fractionThroughPhase: a
			};
		}
	}
	/* istanbul ignore next -- unreachable: the loop's last-index branch above
	* always matches before falling off the end. */
	return Ke;
}
//#endregion
//#region src/render3d/interp.ts
function Je(e) {
	return {
		id: e.id,
		x: e.gx,
		y: e.gy
	};
}
var Ye = class {
	prev = null;
	latest = null;
	positions = new Be(1e3 / 20);
	ingest(e, t) {
		this.latest && (this.prev = this.latest), this.latest = e, this.positions.ingest(e.agents.map(Je), t);
	}
	getLatest() {
		return this.latest;
	}
	alpha(e) {
		return this.positions.alpha(e);
	}
	interpolatedAgentPositions(e) {
		return this.positions.interpolatedPositions(e);
	}
	interpolatedTick(e) {
		return this.latest ? this.prev ? this.prev.tick + (this.latest.tick - this.prev.tick) * this.alpha(e) : this.latest.tick : 0;
	}
}, Xe = .4, Ze = .35, Qe = .25;
function B(e, t) {
	let n = Math.sin(e * .15) * Xe, r = Math.sin(t * .13 + 1.7) * Ze, i = Math.sin((e + t) * .07) * Qe;
	return n + r + i;
}
//#endregion
//#region src/render3d/world-meshes.ts
var $e = .03;
function et(e = 64) {
	let t = e + 1, n = [];
	for (let t = 0; t <= e; t++) for (let r = 0; r <= e; r++) n.push([
		r,
		t,
		B(r, t)
	]);
	let r = (e, n) => n * t + e, i = [];
	for (let t = 0; t < e; t++) for (let n = 0; n < e; n++) {
		let e = r(n, t), a = r(n + 1, t), o = r(n + 1, t + 1), s = r(n, t + 1);
		i.push({
			a: e,
			b: a,
			c: o,
			material: "grass"
		}), i.push({
			a: e,
			b: o,
			c: s,
			material: "grass"
		});
	}
	return {
		positions: n,
		tris: i
	};
}
function tt(e = "territoryTile") {
	return d([
		0,
		0,
		0
	], [
		1,
		0,
		0
	], [
		1,
		1,
		0
	], [
		0,
		1,
		0
	], e);
}
//#endregion
//#region src/render3d/household-layout.ts
function nt(e) {
	let t = (e ^ 2654435769) >>> 0;
	return t = Math.imul(t ^ t >>> 16, 73244475) >>> 0, t = Math.imul(t ^ t >>> 16, 73244475) >>> 0, (t ^ t >>> 16) >>> 0;
}
function rt(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.agents) n.householdId != null && t.set(n.householdId, (t.get(n.householdId) ?? 0) + 1);
	return t;
}
function it(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.communities) {
		if (n.territory.length === 0) continue;
		let e = 0, r = 0;
		for (let t of n.territory) e += t.gx, r += t.gy;
		t.set(n.id, {
			x: e / n.territory.length,
			y: r / n.territory.length
		});
	}
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Set();
	for (let t of e.agents) {
		if (t.householdId == null || (r.add(t.householdId), t.communityId == null)) continue;
		let e = n.get(t.householdId);
		e || (e = /* @__PURE__ */ new Map(), n.set(t.householdId, e)), e.set(t.communityId, (e.get(t.communityId) ?? 0) + 1);
	}
	let i = /* @__PURE__ */ new Map();
	for (let e of r) {
		let r = {
			x: 64 / 2,
			y: 64 / 2
		}, a = n.get(e);
		if (a && a.size > 0) {
			let e = [...a.entries()].sort((e, t) => e[0] - t[0]), n = e[0][0], i = e[0][1];
			for (let [t, r] of e) r > i && (i = r, n = t);
			let o = t.get(n);
			o && (r = o);
		}
		let o = nt(e), s = o % 3600 / 3600 * Math.PI * 2, c = 2.5 + (o >>> 12) % 8;
		i.set(e, {
			x: r.x + Math.cos(s) * c,
			y: r.y + Math.sin(s) * c
		});
	}
	return i;
}
var at = 3, ot = 2.4, st = 2.2, ct = 1.3, lt = .16, ut = 6;
function dt(e) {
	return 1 + (Math.max(1, Math.min(e, ut)) - 1) * lt;
}
function ft(e) {
	let t = dt(e), n = at * t, r = ot * t;
	return {
		w: e >= 5 ? 1.55 * n + .2 : n,
		d: r
	};
}
var pt = ft(ut);
function mt(e, t) {
	let n = .5, r = e / 2 - n / 2;
	return d([
		t - n / 2,
		-.02,
		r
	], [
		t + n / 2,
		-.02,
		r
	], [
		t + n / 2,
		-.02,
		r + n
	], [
		t - n / 2,
		-.02,
		r + n
	], "window");
}
function ht(e) {
	let t = dt(e), n = at * t, r = ot * t, i = st * t, a = ct * t, s = [
		f([
			n,
			r,
			i
		], "wood"),
		o(g([
			n,
			r,
			a
		], "x", "roof"), [
			0,
			0,
			i
		]),
		mt(i, -n / 4)
	];
	if (e >= 3 && s.push(mt(i, n / 4)), e >= 5) {
		let e = n * .55, t = r * .55, c = i * .8, u = a * .8, d = o(l(f([
			e,
			t,
			c
		], "woodDark"), o(g([
			e,
			t,
			u
		], "x", "roof"), [
			0,
			0,
			c
		])), [
			n + .2,
			(r - t) / 2,
			0
		]);
		s.push(d);
	}
	return l(...s);
}
//#endregion
//#region src/render3d/home-placement.ts
var gt = .8;
function _t(e, t) {
	return e.minX < t.maxX && e.maxX > t.minX && e.minY < t.maxY && e.maxY > t.minY;
}
function vt(e, t, n, r, i = 0) {
	return {
		minX: e - i,
		minY: t - i,
		maxX: e + n + i,
		maxY: t + r + i
	};
}
function yt(e) {
	return !Array.isArray(e);
}
function bt(e, t) {
	return yt(e) ? e.near(t) : e;
}
function xt(e, t, n, r, i, a = {}) {
	let o = a.step ?? Math.max(t, n), s = a.maxRings ?? 48, c = (e, a) => {
		let o = vt(e, a, t, n, r);
		for (let e of bt(i, o)) if (_t(e, o)) return !1;
		return !0;
	};
	if (c(e.x, e.y)) return {
		x: e.x,
		y: e.y
	};
	for (let t = 1; t <= s; t++) {
		let n = t * o, r = t * 8;
		for (let t = 0; t < r; t++) {
			let i = t / r * Math.PI * 2, a = e.x + Math.cos(i) * n, o = e.y + Math.sin(i) * n;
			if (c(a, o)) return {
				x: a,
				y: o
			};
		}
	}
	return {
		x: e.x,
		y: e.y
	};
}
var St = class {
	cellSize;
	cells = /* @__PURE__ */ new Map();
	byId = /* @__PURE__ */ new Map();
	constructor(e = 8) {
		this.cellSize = Math.max(1, e);
	}
	cellKeysFor(e) {
		let t = Math.floor(e.minX / this.cellSize), n = Math.floor(e.maxX / this.cellSize), r = Math.floor(e.minY / this.cellSize), i = Math.floor(e.maxY / this.cellSize), a = [];
		for (let e = t; e <= n; e++) for (let t = r; t <= i; t++) a.push(`${e}:${t}`);
		return a;
	}
	set(e, t) {
		this.delete(e);
		let n = this.cellKeysFor(t);
		for (let r of n) {
			let n = this.cells.get(r);
			n || (n = [], this.cells.set(r, n)), n.push({
				id: e,
				rect: t
			});
		}
		this.byId.set(e, {
			rect: t,
			cellKeys: n
		});
	}
	delete(e) {
		let t = this.byId.get(e);
		if (!t) return !1;
		for (let n of t.cellKeys) {
			let t = this.cells.get(n);
			if (!t) continue;
			let r = t.filter((t) => t.id !== e);
			r.length > 0 ? this.cells.set(n, r) : this.cells.delete(n);
		}
		return this.byId.delete(e), !0;
	}
	has(e) {
		return this.byId.has(e);
	}
	get size() {
		return this.byId.size;
	}
	near(e) {
		let t = /* @__PURE__ */ new Set(), n = [];
		for (let r of this.cellKeysFor(e)) {
			let e = this.cells.get(r);
			if (e) for (let r of e) t.has(r.id) || (t.add(r.id), n.push(r.rect));
		}
		return n;
	}
}, Ct = class {
	positions = /* @__PURE__ */ new Map();
	rects;
	footprint;
	margin;
	opts;
	constructor(e, t, n = {}) {
		this.footprint = e, this.margin = t, this.opts = n, this.rects = new St(n.cellSize);
	}
	positionsFor(e) {
		for (let t of this.positions.keys()) e.has(t) || (this.positions.delete(t), this.rects.delete(t));
		for (let [t, n] of e) {
			if (this.positions.has(t)) continue;
			let { w: e, d: r } = this.footprint, i = xt(n, e, r, this.margin, this.rects, this.opts);
			this.positions.set(t, i), this.rects.set(t, vt(i.x, i.y, e, r, this.margin));
		}
		return this.positions;
	}
	get liveCount() {
		return this.rects.size;
	}
};
//#endregion
//#region src/render3d/node-mesh.ts
function wt(e, t) {
	if (t <= 0) return 0;
	let n = e / t;
	return n < 0 ? 0 : n > 1 ? 1 : n;
}
var Tt = .35;
function Et(e) {
	return Tt + (1 - Tt) * e;
}
function Dt() {
	let e = (e, t, n) => o(s(f([
		1,
		1,
		.5
	], "cropLeaf"), [
		n,
		n,
		1
	]), [
		e,
		t,
		0
	]), t = (e, t, n) => o(m(.1 * n, .14, 6, "cropFruit"), [
		e,
		t,
		.5
	]);
	return l(e(-.3, -.2, .9), e(.35, -.1, .7), e(0, .35, .8), t(-.3, -.2, .9), t(.35, -.1, .7), t(0, .35, .8));
}
function Ot() {
	return h(.6, .9, 6, "rock");
}
function kt(e) {
	return e === "food" ? Dt() : Ot();
}
//#endregion
//#region src/render3d/hearth-mesh.ts
var At = 1.6, jt = .35, Mt = 8, Nt = 6;
function Pt(e, t, n, r) {
	return o(h(n, r, Nt, "hearthFire"), [
		e,
		t,
		jt
	]);
}
function Ft() {
	return l(m(At, jt, Mt, "rock"), Pt(0, 0, .55, 1.1), Pt(.35, .2, .34, .8), Pt(-.32, -.25, .3, .7));
}
//#endregion
//#region src/render3d/graveyard-mesh.ts
var It = .22, Lt = .1;
function Rt(e, t, n) {
	return o(f([
		It,
		Lt,
		n
	], "headstone"), [
		e - It / 2,
		t - Lt / 2,
		0
	]);
}
var zt = .12, Bt = .4, Vt = 1.1;
function Ht(e, t) {
	return o(f([
		zt,
		zt,
		Bt
	], "woodDark"), [
		e - zt / 2,
		t - zt / 2,
		0
	]);
}
function Ut() {
	return l(Rt(-.4, -.15, .55), Rt(.05, .25, .45), Rt(.45, -.2, .5), Ht(Vt, Vt), Ht(-1.1, Vt), Ht(Vt, -1.1), Ht(-1.1, -1.1));
}
//#endregion
//#region src/render3d/community-color.ts
var Wt = [
	"blue",
	"green",
	"gold",
	"crimson",
	"plum",
	"cyan",
	"orange",
	"mauve"
];
function Gt(e) {
	let t = Wt.length;
	return Wt[(Math.floor(Math.abs(e)) % t + t) % t];
}
//#endregion
//#region src/render3d/materials.ts
function V(e) {
	let [t, n, r] = Ne(e);
	return [
		t / 255,
		n / 255,
		r / 255
	];
}
function Kt(e, t, n) {
	return [
		e[0] + (t[0] - e[0]) * n,
		e[1] + (t[1] - e[1]) * n,
		e[2] + (t[2] - e[2]) * n
	];
}
var qt = V(z.green), Jt = .4, Yt = [
	"grass",
	"wood",
	"woodDark",
	"roof",
	"window",
	"cropLeaf",
	"cropFruit",
	"rock",
	"territoryTile",
	"hearthFire",
	"headstone",
	"corpseShroud"
], Xt = {
	grass: { color: qt },
	wood: { color: V(z.wood) },
	woodDark: { color: V(z.woodDark) },
	roof: { color: V(z.rust) },
	window: {
		color: V(z.gold),
		emissive: !0
	},
	cropLeaf: { color: V(z.greenMid) },
	cropFruit: { color: V(z.salmon) },
	rock: { color: V(z.slate) },
	territoryTile: { color: [
		1,
		1,
		1
	] },
	hearthFire: {
		color: V(z.orange),
		emissive: !0
	},
	headstone: { color: V(z.silver) },
	corpseShroud: { color: V(z.cream) }
};
function Zt() {
	return Yt.map((e) => Xt[e]);
}
ee(Yt);
var H = [
	1,
	1,
	1,
	1
];
function Qt(e) {
	let [t, n, r] = Kt(qt, V(z[Gt(e)]), Jt);
	return [
		t,
		n,
		r,
		1
	];
}
//#endregion
//#region src/render3d/disease-tint.ts
var $t = V(z.greenDark);
function en(e) {
	return [
		e[0] * $t[0],
		e[1] * $t[1],
		e[2] * $t[2],
		e[3]
	];
}
//#endregion
//#region src/render3d/corpse-mesh.ts
var tn = .85, nn = .38, rn = .16, an = .28, on = .3, sn = .13, cn = .85;
function ln() {
	return l(o(f([
		tn,
		nn,
		rn
	], "corpseShroud"), [
		-.85 / 2,
		-.38 / 2,
		0
	]), o(f([
		an,
		on,
		sn
	], "corpseShroud"), [
		-.85 / 2 - an * cn,
		-.3 / 2,
		0
	]));
}
function un(e) {
	return e ? en(H) : H;
}
//#endregion
//#region src/render3d/day-night.ts
var dn = .22, fn = .42;
function pn(e) {
	let t = ke(e), n = dn + (fn - dn) * t, r = e * Math.PI * 2 - Math.PI / 2;
	return {
		dayNight: t,
		ambient: n,
		sunDir: [
			Math.cos(r) * .6,
			.5,
			Math.max(.05, Math.sin(r))
		]
	};
}
var mn = {
	commute: .12,
	work: .4,
	gather: .63,
	sleep: .88
}, hn = {
	commute: .28,
	work: .23,
	gather: .25,
	sleep: .24
};
function gn(e, t) {
	let { phase: n, fractionThroughPhase: r } = qe(e, t);
	return ((mn[n] + r * hn[n]) % 1 + 1) % 1;
}
//#endregion
//#region src/render3d/camera-input.ts
var _n = 4;
function vn(e, t, n = {}) {
	let r = null, i = 0, a = 0, o = 0, s = (e) => e.preventDefault(), c = (t) => {
		r = t.button, i = t.clientX, a = t.clientY, o = 0, e.setPointerCapture(t.pointerId);
	}, l = (e) => {
		if (r === null) return;
		let s = e.clientX - i, c = e.clientY - a;
		if (i = e.clientX, a = e.clientY, o += Math.abs(s) + Math.abs(c), r === 2 || e.shiftKey) {
			let e = t.distance * .0015;
			t.pan(-s * e, c * e), n.onPan?.();
		} else t.orbit(-s * .005, c * .005);
	}, u = (t) => {
		let i = r !== null && o < _n;
		if (r = null, e.releasePointerCapture(t.pointerId), i && n.onClick) {
			let r = e.getBoundingClientRect();
			n.onClick(t.clientX - r.left, t.clientY - r.top);
		}
	}, d = (e) => {
		e.preventDefault(), t.zoom(Math.exp(e.deltaY * .001));
	};
	return e.addEventListener("contextmenu", s), e.addEventListener("pointerdown", c), e.addEventListener("pointermove", l), e.addEventListener("pointerup", u), e.addEventListener("wheel", d, { passive: !1 }), { dispose() {
		e.removeEventListener("contextmenu", s), e.removeEventListener("pointerdown", c), e.removeEventListener("pointermove", l), e.removeEventListener("pointerup", u), e.removeEventListener("wheel", d);
	} };
}
//#endregion
//#region ../sim-core/src/components/genome.ts
var yn = [
	"sociability",
	"risk",
	"aggression",
	"loyalty",
	"greed",
	"industriousness",
	"curiosity"
], bn = ["food", "material"], xn = .85, Sn = 1.15, Cn = .85, wn = 1.15, Tn = [
	"skin",
	"skinMid",
	"skinLight",
	"skinDark",
	"skinDeep"
], En = [
	"hairBlack",
	"hairBrown",
	"hairBlonde",
	"hairRed",
	"hairGrey"
], Dn = "clay", On = [
	...Tn,
	...En,
	Dn
];
function kn() {
	return On.map((e) => ({ color: V(z[e]) }));
}
var An = .45, jn = .35, Mn = {
	stand: {
		armL: 0,
		armR: 0,
		legL: 0,
		legR: 0,
		lean: 0
	},
	walkA: {
		armL: jn,
		armR: -.35,
		legL: -.45,
		legR: An,
		lean: -.05
	},
	walkB: {
		armL: -.35,
		armR: jn,
		legL: An,
		legR: -.45,
		lean: -.05
	},
	work: {
		armL: -.85,
		armR: -.85,
		legL: 0,
		legR: 0,
		lean: -.35
	},
	interact: {
		armL: 0,
		armR: -1.1,
		legL: 0,
		legR: 0,
		lean: -.08
	},
	aggress: {
		armL: -1.5,
		armR: -1.5,
		legL: 0,
		legR: 0,
		lean: -.18
	},
	eat: {
		armL: 0,
		armR: -1.85,
		legL: 0,
		legR: 0,
		lean: 0
	}
}, Nn = {
	idle: "stand",
	rest: "stand",
	walk: "stand",
	work: "work",
	help: "work",
	teach: "work",
	gift: "interact",
	share: "interact",
	trade: "interact",
	attack: "aggress",
	sabotage: "aggress",
	steal: "aggress",
	rumor: "aggress",
	eat: "eat"
};
function Pn(e) {
	return Nn[e] ?? "stand";
}
var Fn = .16, In = .16, Ln = .7, Rn = .03, zn = Ln, Bn = .3, Vn = .5, Hn = .55, Un = 1.25, Wn = .14, Gn = .14, Kn = .5, qn = .32, Jn = 1.27, Yn = 1.08, Xn = qn * .55, Zn = .24, Qn = .08, $n = [
	0,
	0,
	1.59
];
function er(e, t, n) {
	return n === 0 ? e : o(c(o(e, [
		-t[0],
		-t[1],
		-t[2]
	]), n), t);
}
function tr(e, t, n) {
	let r = (e === "L" ? -1 : 1) < 0 ? -.19 : Rn, i = r + In / 2, a = o(f([
		Fn,
		In,
		Ln
	], t), [
		-.16 / 2,
		r,
		0
	]), s = o(f([
		Zn,
		In,
		Qn
	], t), [
		-.24 * .4,
		r,
		0
	]), c = [
		0,
		i,
		zn
	];
	return er(l(a, s), c, n);
}
function nr(e, t, n) {
	let r = (e === "L" ? -1 : 1) < 0 ? -.41000000000000003 : .27, i = r + Gn / 2;
	return er(o(f([
		Wn,
		Gn,
		Kn
	], t), [
		-.14 / 2,
		r,
		Un - Kn
	]), [
		0,
		i,
		Un
	], n);
}
function rr(e) {
	return o(f([
		Bn,
		Vn,
		Hn
	], e), [
		-.3 / 2,
		-.5 / 2,
		zn
	]);
}
function ir(e) {
	return o(f([
		qn,
		qn,
		qn
	], e), [
		-.32 / 2,
		-.32 / 2,
		Jn
	]);
}
function ar(e) {
	let t = qn * Yn, n = 1.59 - Xn * .4;
	return o(f([
		t,
		t,
		Xn
	], e), [
		-.3456 / 2,
		-.3456 / 2,
		n
	]);
}
function or(e) {
	let { skinKey: t, hairKey: n, clothKey: r, pose: i } = e, a = Mn[i], o = tr("L", r, a.legL), s = tr("R", r, a.legR), c = nr("L", t, a.armL), u = nr("R", t, a.armR);
	return l(o, s, er(l(rr(r), ir(t), ar(n), c, u), [
		0,
		0,
		zn
	], a.lean));
}
var sr = .6, cr = 1, lr = .94;
function ur(e) {
	return e === "child" ? sr : e === "elder" ? lr : cr;
}
function dr(e) {
	let t = (e ^ 2654435769) >>> 0;
	return t = Math.imul(t ^ t >>> 16, 73244475) >>> 0, t = Math.imul(t ^ t >>> 16, 73244475) >>> 0, (t ^ t >>> 16) >>> 0;
}
var fr = .92, pr = 1.08;
function mr(e) {
	let t = fr + dr(e) % 1e4 / 1e4 * (pr - fr);
	return [
		t,
		t,
		t,
		1
	];
}
function hr(e, t, n) {
	return `${e}|${t}|${n}`;
}
var gr = class {
	cache = /* @__PURE__ */ new Map();
	getOrBuild(e, t) {
		let n = this.cache.get(e);
		return n === void 0 && (n = t(), this.cache.set(e, n)), n;
	}
	get size() {
		return this.cache.size;
	}
}, _r = 1.6;
function vr(e) {
	return dr(e) % 1e4 / 1e4;
}
function yr(e, t) {
	let n = e / 1e3 * _r + vr(t);
	return n - Math.floor(n);
}
function br(e, t) {
	return yr(e, t) < .5 ? "walkA" : "walkB";
}
var xr = .05;
function Sr(e, t) {
	let n = yr(e, t);
	return Math.abs(Math.sin(n * Math.PI * 2)) * xr;
}
function Cr(e, t, n, r) {
	return t || e === "walk" ? br(n, r) : Pn(e);
}
var wr = 1e-6;
function Tr(e, t, n) {
	if (!e) return {
		facing: n,
		moving: !1
	};
	let r = t.x - e.x, i = t.y - e.y;
	return r * r + i * i <= wr ? {
		facing: n,
		moving: !1
	} : {
		facing: Math.atan2(i, r),
		moving: !0
	};
}
var Er = class {
	lastPos = /* @__PURE__ */ new Map();
	lastFacing = /* @__PURE__ */ new Map();
	update(e, t) {
		let n = Tr(this.lastPos.get(e), t, this.lastFacing.get(e) ?? 0);
		return this.lastFacing.set(e, n.facing), this.lastPos.set(e, t), n;
	}
	prune(e) {
		for (let t of this.lastPos.keys()) e.has(t) || (this.lastPos.delete(t), this.lastFacing.delete(t));
	}
};
function Dr(e) {
	let { pos: t, groundZ: n, facing: r, heightGene: i, buildGene: a, stageScale: o, bobOffset: s } = e, c = [
		a * o,
		a * o,
		i * o
	];
	return v(x([
		t.x,
		t.y,
		n + s
	]), v(C(r), S(c)));
}
//#endregion
//#region src/render3d/selection.ts
var Or = V(z.gold), kr = 1.8;
function Ar(e) {
	return [
		e[0] * Or[0] * kr,
		e[1] * Or[1] * kr,
		e[2] * Or[2] * kr,
		e[3]
	];
}
//#endregion
//#region ../../../engine/core/src/collision/spatial-hash.ts
function jr(e, t) {
	let n = 1 << 20;
	return (e + n) * (1 << 22) + (t + n);
}
var Mr = class {
	cellSize;
	buckets = /* @__PURE__ */ new Map();
	positions = /* @__PURE__ */ new Map();
	constructor(e) {
		if (!(e > 0)) throw Error(`SpatialHash: cellSize must be > 0, got ${e}`);
		this.cellSize = e;
	}
	cellOf(e, t) {
		return [Math.floor(e / this.cellSize), Math.floor(t / this.cellSize)];
	}
	insert(e, t, n) {
		let [r, i] = this.cellOf(t, n), a = jr(r, i), o = this.buckets.get(a);
		o || (o = [], this.buckets.set(a, o)), o.push(e), this.positions.set(e, {
			x: t,
			y: n
		});
	}
	clear() {
		this.buckets.clear(), this.positions.clear();
	}
	queryRadius(e, t, n) {
		let [r, i] = this.cellOf(e - n, t - n), [a, o] = this.cellOf(e + n, t + n), s = /* @__PURE__ */ new Set();
		for (let e = r; e <= a; e++) for (let t = i; t <= o; t++) {
			let n = this.buckets.get(jr(e, t));
			if (n) for (let e of n) s.add(e);
		}
		return Array.from(s).sort((e, t) => e - t);
	}
}, Nr = Math.PI * (3 - Math.sqrt(5)), Pr = 1e-9;
function Fr(e, t = {}) {
	let n = t.iterations ?? 4, r = [...e].sort((e, t) => e.id - t.id), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = 0;
	for (let e of r) i.set(e.id, {
		x: e.x,
		y: e.y
	}), a.set(e.id, e.radius), e.radius > o && (o = e.radius);
	if (r.length < 2) return i;
	let s = Math.max(o * 2, 1e-6);
	for (let e = 0; e < n; e++) {
		let e = new Mr(s);
		for (let t of r) {
			let n = i.get(t.id);
			n && e.insert(t.id, n.x, n.y);
		}
		for (let t of r) {
			let n = i.get(t.id), r = a.get(t.id);
			if (!n || r === void 0) continue;
			let s = e.queryRadius(n.x, n.y, r + o);
			for (let e of s) {
				if (e <= t.id) continue;
				let o = i.get(e), s = a.get(e);
				!o || s === void 0 || Ir(t.id, n, r, o, s);
			}
		}
	}
	return i;
}
function Ir(e, t, n, r, i) {
	let a = n + i, o = r.x - t.x, s = r.y - t.y, c = o * o + s * s;
	if (c >= a * a) return;
	let l = Math.sqrt(c), u, d;
	if (l < Pr) {
		let t = e * Nr % (Math.PI * 2);
		u = Math.cos(t), d = Math.sin(t);
	} else u = o / l, d = s / l;
	let f = (a - l) / 2;
	t.x -= u * f, t.y -= d * f, r.x += u * f, r.y += d * f;
}
//#endregion
//#region src/render3d/agent-collision.ts
var Lr = .5;
function Rr(e, t = Lr) {
	return Fr(Array.from(e, ([e, n]) => ({
		id: e,
		x: n.x,
		y: n.y,
		radius: t
	})));
}
//#endregion
//#region src/render3d/app.ts
var zr = 1;
function Br(e, t, n) {
	let r = new Ye(), i = !1, a = null, o = null, s = null, c = null, l = null, u = null, d = null, f = F(), p = new Er(), m = new We({ enabled: !0 }), h = null, g = 0, y = null, b = null, C = (e) => {
		let t = e.data;
		t.type === "snapshot" && r.ingest(t.snapshot, performance.now());
	};
	t.addEventListener("message", C), w();
	async function w() {
		let t;
		try {
			t = await oe(e);
		} catch {
			n.onRendererUnavailable?.("3D rendering could not start — WebGL2 is unavailable in this browser. This is usually caused by disabled hardware acceleration or running inside a VM/sandbox without a GPU adapter, rather than a missing browser feature (WebGL2 has shipped everywhere since 2017). Try enabling hardware acceleration in your browser's settings, or open this in a different browser/machine. The simulation and chronicle keep running.");
			return;
		}
		if (i) {
			t.glContext.dispose();
			return;
		}
		l = t;
		let C = new De(t, { clearColor: [...V(z.navy), 1] }), w = ee([...Yt, ...On]);
		C.setMaterials([...Zt(), ...kn()]);
		let E = C.uploadMesh(et(64), w), D = C.uploadMesh(tt(), w), O = C.uploadMesh(kt("food"), w), j = C.uploadMesh(kt("material"), w), N = C.uploadMesh(Ft(), w), te = C.uploadMesh(Ut(), w), ne = C.uploadMesh(ln(), w), I = /* @__PURE__ */ new Map();
		function L(e) {
			let t = I.get(e);
			return t || (t = C.uploadMesh(ht(e), w), I.set(e, t)), t;
		}
		let ie = new Ct(pt, gt, { maxRings: Math.ceil(Math.SQRT2 * 64 / Math.max(pt.w, pt.d)) + 2 }), ae = new gr();
		function se(e, t, n) {
			return ae.getOrBuild(hr(e, t, n), () => {
				let r = or({
					skinKey: e,
					hairKey: t,
					clothKey: Dn,
					pose: n
				});
				return {
					mesh: r,
					handle: C.uploadMesh(r, w)
				};
			});
		}
		let ce = new k({
			target: [
				64 / 2,
				64 / 2,
				1
			],
			distance: 64 * .85,
			yaw: Math.PI / 4,
			pitch: Math.PI / 4,
			fovy: Math.PI / 3.2,
			near: .1,
			far: 384,
			minPitch: .05,
			maxPitch: Math.PI / 2 - .05,
			minDistance: 4,
			maxDistance: 192
		});
		a = vn(e, ce, {
			onClick(t, r) {
				let i = null;
				if (d && u) {
					let n = e.getBoundingClientRect();
					i = M(A(t, r, n.width, n.height, d), [...u.entries()].map(([e, t]) => ({
						bounds: t.bounds,
						value: e
					})));
				}
				y = i, n.onAgentClicked?.(i);
			},
			onPan() {
				b !== null && (b = null, n.onFollowCancelled?.());
			}
		});
		function R() {
			f = F();
			let t = Math.max(1, Math.round(e.clientWidth * f)), n = Math.max(1, Math.round(e.clientHeight * f));
			(e.width !== t || e.height !== n) && (e.width = t, e.height = n, C.resizeDevicePixels(t, n));
		}
		typeof ResizeObserver < "u" ? (s = new ResizeObserver(() => R()), s.observe(e)) : (c = R, window.addEventListener("resize", c)), R();
		function le(t) {
			if (i) return;
			let a = performance.now();
			R();
			let s = r.getLatest();
			if (s) {
				let i = [];
				i.push({
					mesh: E,
					instances: P([{
						model: _(),
						tint: H
					}]),
					instanceCount: 1
				});
				let a = [];
				for (let e of s.communities) {
					let t = Qt(e.id);
					for (let n of e.territory) {
						let e = B(n.gx, n.gy) + $e;
						a.push({
							model: x([
								n.gx,
								n.gy,
								e
							]),
							tint: t
						});
					}
				}
				if (a.length > 0 && i.push({
					mesh: D,
					instances: P(a),
					instanceCount: a.length
				}), s.hearth) {
					let { gx: e, gy: t } = s.hearth, n = B(e, t), r = x([
						e + .5,
						t + .5,
						n
					]);
					i.push({
						mesh: N,
						instances: P([{
							model: r,
							tint: H
						}]),
						instanceCount: 1
					});
				}
				if (s.graveyard) {
					let { gx: e, gy: t } = s.graveyard, n = B(e, t), r = x([
						e + .5,
						t + .5,
						n
					]);
					i.push({
						mesh: te,
						instances: P([{
							model: r,
							tint: H
						}]),
						instanceCount: 1
					});
				}
				let o = (s.corpses ?? []).map((e) => {
					let t = B(e.gx, e.gy);
					return {
						model: x([
							e.gx + .5,
							e.gy + .5,
							t
						]),
						tint: un(e.rotting)
					};
				});
				o.length > 0 && i.push({
					mesh: ne,
					instances: P(o),
					instanceCount: o.length
				});
				let c = rt(s), l = it(s), f = ie.positionsFor(l), h = /* @__PURE__ */ new Map();
				for (let [e, t] of f) {
					let n = L(c.get(e) ?? 1), r = B(Math.round(t.x), Math.round(t.y)), i = {
						model: x([
							t.x,
							t.y,
							r
						]),
						tint: H
					}, a = h.get(n);
					a ? a.push(i) : h.set(n, [i]);
				}
				for (let [e, t] of h) i.push({
					mesh: e,
					instances: P(t),
					instanceCount: t.length
				});
				let g = [], w = [];
				for (let e of s.resourceNodes) {
					let t = Et(wt(e.stock, e.maxStock)), n = B(e.gx, e.gy), r = {
						model: v(x([
							e.gx + .5,
							e.gy + .5,
							n
						]), S([
							t,
							t,
							t
						])),
						tint: H
					};
					e.kind === "food" ? g.push(r) : w.push(r);
				}
				g.length > 0 && i.push({
					mesh: O,
					instances: P(g),
					instanceCount: g.length
				}), w.length > 0 && i.push({
					mesh: j,
					instances: P(w),
					instanceCount: w.length
				});
				let k = m.time("interp", () => r.interpolatedAgentPositions(t)), A = m.time("collision", () => Rr(k));
				if (b !== null) {
					let e = A.get(b);
					if (e) {
						let t = B(Math.round(e.x), Math.round(e.y));
						ce.target = [
							e.x,
							e.y,
							t + zr
						];
					} else b = null, n.onFollowCancelled?.();
				}
				let M = /* @__PURE__ */ new Map(), ee = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Set();
				for (let e of s.agents) {
					let n = A.get(e.id);
					if (!n) continue;
					F.add(e.id);
					let { facing: r, moving: i } = p.update(e.id, n), a = Cr(e.action, i, t, e.id), o = se(e.appearance.skinTone, e.appearance.hairTone, a), s = B(Math.round(n.x), Math.round(n.y)), c = i || e.action === "walk" ? Sr(t, e.id) : 0, l = Dr({
						pos: n,
						groundZ: s,
						facing: r,
						heightGene: e.appearance.height,
						buildGene: e.appearance.build,
						stageScale: ur(e.stage),
						bobOffset: c
					}), u = mr(e.id), d = e.diseased ? en(u) : u, f = {
						model: l,
						tint: e.id === y ? Ar(d) : d
					}, m = ee.get(o.handle);
					m ? m.push(f) : ee.set(o.handle, [f]), M.set(e.id, {
						headWorld: T(l, $n),
						model: l,
						bounds: re(o.mesh, l)
					});
				}
				p.prune(F);
				for (let [e, t] of ee) i.push({
					mesh: e,
					instances: P(t),
					instanceCount: t.length
				});
				u = M;
				let I = pn(gn(r.interpolatedTick(t), n.ticksPerDay)), ae = e.width / Math.max(1, e.height), oe = v(ce.projMatrix(ae), ce.viewMatrix());
				d = oe, C.render({
					viewProj: oe,
					sunDir: I.sunDir,
					dayNight: I.dayNight,
					ambient: I.ambient,
					time: t / 1e3,
					draws: i
				});
			}
			m.add("frame", performance.now() - a), g += 1, g % 30 == 0 && (h = m.report()), o = requestAnimationFrame(le);
		}
		o = requestAnimationFrame(le);
	}
	return {
		dispose() {
			i || (i = !0, t.removeEventListener("message", C), a?.dispose(), o !== null && cancelAnimationFrame(o), s?.disconnect(), c && window.removeEventListener("resize", c), l?.glContext.dispose(), l = null);
		},
		getAgentRenderState() {
			return u;
		},
		getViewProj() {
			return d;
		},
		setSelectedAgent(e) {
			y = e;
		},
		setFollow(e) {
			b = e;
		},
		getFollowedAgentId() {
			return b;
		},
		getRenderReport() {
			return h;
		},
		getDpr() {
			return f;
		}
	};
}
//#endregion
//#region ../sim-core/src/economy/constants.ts
var Vr = "rest";
//#endregion
//#region src/agent-name.ts
function Hr(e) {
	let t = (e ^ 625341585) >>> 0;
	return t = Math.imul(t ^ t >>> 15, 739982445) >>> 0, t = Math.imul(t ^ t >>> 12, 695872825) >>> 0, (t ^ t >>> 15) >>> 0;
}
var Ur = [
	"Bram",
	"Cor",
	"Del",
	"Eda",
	"Fen",
	"Gil",
	"Hes",
	"Ivo",
	"Jor",
	"Kes",
	"Lir",
	"Mox",
	"Nan",
	"Or",
	"Pell",
	"Quen",
	"Rowe",
	"Sab",
	"Tam",
	"Ulf",
	"Vex",
	"Wren",
	"Yara",
	"Zeph"
], Wr = [
	"wick",
	"ley",
	"mund",
	"ric",
	"wyn",
	"ford",
	"holt",
	"mere",
	"dale",
	"thorn",
	"vale",
	"stead",
	"wood",
	"crest",
	"haven",
	"brook",
	"field",
	"moor",
	"gate",
	"burn"
];
function Gr(e) {
	let t = Hr(e);
	return `${Ur[t % Ur.length]}${Wr[Math.floor(t / Ur.length) % Wr.length]}`;
}
//#endregion
//#region src/render3d/screen-project.ts
var Kr = 1e-6;
function qr(e, t, n, r) {
	let i = e[0], a = e[1], o = e[2], s = t[0] * i + t[4] * a + t[8] * o + t[12], c = t[1] * i + t[5] * a + t[9] * o + t[13], l = t[3] * i + t[7] * a + t[11] * o + t[15];
	if (l < Kr) return {
		x: 0,
		y: 0,
		visible: !1
	};
	let u = s / l, d = c / l;
	return {
		x: (u * .5 + .5) * n,
		y: (1 - (d * .5 + .5)) * r,
		visible: u >= -1 && u <= 1 && d >= -1 && d <= 1
	};
}
//#endregion
//#region src/render3d/glyphs.ts
var Jr = {
	work: "⚒",
	eat: "🍞",
	gift: "🎁",
	share: "🤝",
	help: "🤛",
	teach: "📖",
	trade: "⚖",
	steal: "👕",
	sabotage: "💥",
	rumor: "💬",
	attack: "⚔"
};
function Yr(e) {
	return Jr[e] ?? null;
}
var Xr = {
	"food-gatherer": "F",
	"material-gatherer": "M",
	crafter: "C",
	teacher: "T",
	caretaker: "K",
	"grave-digger": "⛏",
	medic: "+"
};
function Zr(e) {
	return Xr[e] ?? null;
}
//#endregion
//#region src/render3d/overlay.ts
function Qr(e) {
	let t = null;
	for (let [n, r] of Object.entries(e)) {
		let e = (r - 0) / 100;
		(t === null || e < t.fraction) && (t = {
			kind: n,
			fraction: e
		});
	}
	return t;
}
var $r = .3, ei = .6;
function ti(e, t) {
	return t ? "red" : e <= $r ? "orange" : e <= ei ? "gold" : "green";
}
function ni(e) {
	switch (e) {
		case "food-gatherer": return "green";
		case "material-gatherer": return "slate";
		case "crafter": return "orange";
		case "teacher": return "cyan";
		case "caretaker": return "salmon";
		case "grave-digger": return "woodDark";
		case "medic": return "crimson";
		default: return "steel";
	}
}
var ri = "16px sans-serif", ii = "11px monospace", ai = 16, oi = 28, si = 4, ci = 8, li = 12, ui = 12, di = 13, fi = 15, pi = "10px monospace";
function mi(e, t, n) {
	e.clearRect(0, 0, n.width, n.height), e.textAlign = "center";
	for (let r of t) {
		let t = qr(r.headWorld, n.viewProj, n.width, n.height);
		if (!t.visible) continue;
		r.id === n.selectedAgentId && (e.strokeStyle = z.gold, e.lineWidth = 2, e.beginPath(), e.arc(t.x, t.y, ui, 0, Math.PI * 2), e.stroke());
		let i = Yr(r.action), a = t.y - ai;
		if (i && (e.font = ri, e.textBaseline = "bottom", e.fillStyle = z.cream, e.fillText(i, t.x, a)), n.showJobs) {
			let n = Zr(r.occupation);
			if (n) {
				let i = t.x + fi, o = a - ai / 2;
				e.fillStyle = z[ni(r.occupation)], e.fillRect(i - di / 2, o - di / 2, di, di), e.font = pi, e.textBaseline = "middle", e.fillStyle = z.ink, e.fillText(n, i, o);
			}
		}
		if (!n.showTags) continue;
		let o = Qr(r.needs), s = a;
		if (o) {
			let n = a - ci, i = t.x - oi / 2;
			e.fillStyle = z.ink, e.fillRect(i, n, oi, si);
			let c = oi * Math.max(0, Math.min(1, o.fraction));
			e.fillStyle = z[ti(o.fraction, r.starving)], e.fillRect(i, n, c, si), s = n;
		}
		e.font = ii, e.textBaseline = "bottom", e.fillStyle = z.white, e.fillText(Gr(r.id), t.x, s - li);
	}
}
function hi(e) {
	let t = document.createElement("canvas");
	return t.style.position = "absolute", t.style.inset = "0", t.style.width = "100%", t.style.height = "100%", t.style.pointerEvents = "none", e.appendChild(t), t;
}
function gi(e, t, n, r) {
	let i = Math.max(1, Math.round(t * r)), a = Math.max(1, Math.round(n * r));
	return e.width === i && e.height === a ? !1 : (e.width = i, e.height = a, !0);
}
//#endregion
//#region src/inspect-panel.ts
function U(e, t, n) {
	let r = document.createElement(e);
	return r.className = t, n !== void 0 && (r.textContent = n), r;
}
function W(e) {
	let t = U("div", "hollow-inspect-section"), n = U("h3", "hollow-inspect-section-title", e);
	return n.style.color = z.gold, t.appendChild(n), t;
}
function G(e, t) {
	let n = U("div", "hollow-inspect-row"), r = U("span", "hollow-inspect-row-label", `${e}: `);
	r.style.color = z.steel;
	let i = U("span", "hollow-inspect-row-value", t);
	return i.style.color = z.cream, n.appendChild(r), n.appendChild(i), n;
}
function K(e) {
	return Number.isInteger(e) ? String(e) : e.toFixed(2);
}
function _i(e, t) {
	let n = U("div", "hollow-inspect-panel");
	n.style.position = "absolute", n.style.top = "0", n.style.right = "0", n.style.background = z.ink, n.style.color = z.cream, n.style.borderLeft = `2px solid ${z.navy}`;
	let r = U("div", "hollow-inspect-header"), i = U("h2", "hollow-inspect-name", e.name);
	i.style.color = z.cream;
	let a = U("button", "hollow-inspect-close", "×");
	a.type = "button", a.setAttribute("aria-label", "Close inspect panel"), a.style.color = z.cream, a.style.background = z.navy, a.addEventListener("click", () => t.onClose()), r.appendChild(i), r.appendChild(a), n.appendChild(r);
	let o = U("div", "hollow-inspect-status", e.alive ? `${e.stage} • age ${e.ageTicks} ticks${e.starving ? " • STARVING" : ""}` : `deceased${e.deathCause ? ` (${e.deathCause})` : ""}${e.deathTick === null ? "" : ` at tick ${e.deathTick}`}`);
	o.style.color = e.starving ? z.red : z.silver, n.appendChild(o);
	let s = U("button", "hollow-inspect-follow", t.isFollowing ? "Following (F)" : "Follow (F)");
	s.type = "button", s.style.color = z.cream, s.style.background = t.isFollowing ? z.gold : z.slate, s.addEventListener("click", () => t.onToggleFollow()), n.appendChild(s);
	let c = W("Identity");
	c.appendChild(G("id", String(e.id))), c.appendChild(G("community", e.communityId === null ? "none" : String(e.communityId))), c.appendChild(G("household", e.householdId === null ? "none" : String(e.householdId))), n.appendChild(c);
	let l = W("Genome");
	l.appendChild(G("skin", e.genome.appearance.skinTone)), l.appendChild(G("hair", e.genome.appearance.hairTone)), l.appendChild(G("height", K(e.genome.appearance.height))), l.appendChild(G("build", K(e.genome.appearance.build)));
	for (let [t, n] of Object.entries(e.genome.behavior)) l.appendChild(G(t, K(n)));
	for (let [t, n] of Object.entries(e.genome.aptitude)) l.appendChild(G(`${t} aptitude`, K(n)));
	if (n.appendChild(l), e.needs) {
		let t = W("Needs");
		for (let [n, r] of Object.entries(e.needs)) t.appendChild(G(n, K(r)));
		n.appendChild(t);
	}
	if (e.bdi) {
		let t = W("Mind");
		t.appendChild(G("action", e.bdi.action)), t.appendChild(G("intention", e.bdi.intentionKind ?? "none")), e.bdi.foodDepletedTicks > 0 && t.appendChild(G("food-depleted ticks", String(e.bdi.foodDepletedTicks))), n.appendChild(t);
	}
	let u = W("Relationships");
	if (e.relationships.length === 0) {
		let e = U("div", "hollow-inspect-empty", "No recorded ties yet.");
		e.style.color = z.steel, u.appendChild(e);
	} else for (let t of e.relationships) u.appendChild(G(t.peerName, K(t.score)));
	n.appendChild(u);
	let d = W("Kin");
	if (e.kin.partner && d.appendChild(G("partner", e.kin.partner.name)), e.kin.parents.length > 0 && d.appendChild(G("parents", e.kin.parents.map((e) => e.name).join(", "))), e.kin.children.length > 0 && d.appendChild(G("children", e.kin.children.map((e) => e.name).join(", "))), !e.kin.partner && e.kin.parents.length === 0 && e.kin.children.length === 0) {
		let e = U("div", "hollow-inspect-empty", "No recorded kin.");
		e.style.color = z.steel, d.appendChild(e);
	}
	if (n.appendChild(d), e.community) {
		let t = W("Community");
		t.appendChild(G("members", String(e.community.memberCount))), t.appendChild(G("leader", e.community.isLeader ? "this agent" : e.community.leaderName ?? "none yet")), t.appendChild(G("standing", K(e.community.standing))), t.appendChild(G("share rate", K(e.community.shareRate))), t.appendChild(G("cooperation", K(e.community.cooperationExpectation))), t.appendChild(G("admission", K(e.community.admissionPolicy))), n.appendChild(t);
	}
	return n;
}
//#endregion
//#region ../sim-core/src/protocols/starvation.ts
var vi = { ONSET: "starvation-onset" }, q = {
	FORMED: "community.formed",
	JOINED: "community.joined",
	LEFT: "community.left",
	SPLIT: "community.split",
	MERGED: "community.merged",
	DISSOLVED: "community.dissolved"
}, J = {
	BONDED: "family.bonded",
	BIRTH: "family.birth",
	DEATH: "family.death",
	STAGE_CHANGED: "family.stage-changed"
}, Y = {
	GIFT: "social.gift",
	SHARE: "social.share",
	HELP: "social.help-labor",
	TEACH: "social.teach",
	TRADE: "social.trade",
	STEAL: "social.steal",
	STEAL_DETECTED: "social.steal-detected",
	SABOTAGE: "social.sabotage",
	RUMOR: "social.rumor",
	ATTACK: "social.attack"
}, yi = {
	LEADER_CHANGED: "governance.leader-changed",
	NORM_CHANGED: "governance.norm-changed",
	SANCTIONED: "governance.sanctioned"
}, bi = {
	STARTED: "feud.started",
	ESCALATED: "feud.escalated",
	RECONCILED: "feud.reconciled"
}, xi = { ROLE_CHANGED: "jobs.role-changed" }, Si = {
	INFECTED: "mortality.infected",
	RECOVERED: "mortality.recovered",
	TREATED: "mortality.treated",
	BURIED: "mortality.buried"
}, Ci = {
	FAMINE: "shock.famine",
	BOOM: "shock.boom",
	DISASTER: "shock.disaster",
	PLAGUE: "shock.plague"
}, wi = 5e4;
Object.values(Y), Object.values(J), Object.values(q), Object.values(yi), Object.values(bi), Object.values(xi), Object.values(Si);
//#endregion
//#region ../sim-core/src/observe/export.ts
var Ti = 4, Ei = [
	"tick",
	"year",
	"population",
	"births_cum",
	"births_window",
	"deaths_window",
	"deaths_oldAge_window",
	"deaths_starvation_window",
	"deaths_violence_window",
	"deaths_disease_window",
	"community_count",
	"community_mean_size",
	"mean_pairwise_trust",
	"wealth_gini",
	"coop_window",
	"antag_window",
	"feud_active_dyads",
	...yn.map((e) => `mean_gene_${e}`)
], Di = new Set([
	"tick",
	"year",
	"population",
	"births_cum",
	"births_window",
	"deaths_window",
	"deaths_oldAge_window",
	"deaths_starvation_window",
	"deaths_violence_window",
	"deaths_disease_window",
	"community_count",
	"coop_window",
	"antag_window",
	"feud_active_dyads"
]);
function Oi(e) {
	let t = {
		tick: e.tick,
		year: e.year,
		population: e.population,
		births_cum: e.births_cum,
		births_window: e.births_window,
		deaths_window: e.deaths_window,
		deaths_oldAge_window: e.deaths_oldAge_window,
		deaths_starvation_window: e.deaths_starvation_window,
		deaths_violence_window: e.deaths_violence_window,
		deaths_disease_window: e.deaths_disease_window ?? 0,
		community_count: e.community_count,
		community_mean_size: e.community_mean_size,
		mean_pairwise_trust: e.mean_pairwise_trust,
		wealth_gini: e.wealth_gini,
		coop_window: e.coop_window,
		antag_window: e.antag_window,
		feud_active_dyads: e.feud_active_dyads ?? 0
	};
	for (let n of yn) t[`mean_gene_${n}`] = e.genes[n] ?? 0;
	return t;
}
function ki(e, t) {
	return Di.has(e) ? String(t) : t.toFixed(Ti);
}
function Ai(e) {
	let t = [Ei.join(",")];
	for (let n of e) {
		let e = Oi(n);
		t.push(Ei.map((t) => ki(t, e[t] ?? 0)).join(","));
	}
	return t.join("\n") + "\n";
}
function ji(e) {
	return e.length === 0 ? "" : e.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
function Mi(e) {
	let t = [...e].sort((e, t) => e.id - t.id);
	return JSON.stringify(t, null, 2) + "\n";
}
//#endregion
//#region src/research-store.ts
var Ni = Array(wi), Pi = 0, Fi = 0, Ii = 0, Li = null, Ri = [], zi = /* @__PURE__ */ new Set(), Bi = /* @__PURE__ */ new Set();
function Vi(e) {
	Fi < 5e4 ? (Ni[Fi] = e, Fi++) : (Ni[Pi] = e, Pi = (Pi + 1) % wi, Ii++), Li = null;
}
function Hi() {
	if (Li) return Li;
	let e = Array(Fi);
	for (let t = 0; t < Fi; t++) e[t] = Ni[(Pi + t) % wi];
	return Li = e, e;
}
function Ui(e) {
	if (e.length !== 0) {
		for (let t of e) Vi(t);
		for (let t of zi) t(e);
	}
}
function Wi(e) {
	Ri.push(e);
	for (let t of Bi) t(e);
}
function Gi() {
	return Hi();
}
function Ki() {
	return Ii;
}
function qi() {
	return Ri;
}
function Ji(e) {
	return zi.add(e), () => zi.delete(e);
}
function Yi(e) {
	return Bi.add(e), () => Bi.delete(e);
}
function Xi() {
	Ni = Array(wi), Pi = 0, Fi = 0, Ii = 0, Li = null, Ri.length = 0, zi.clear(), Bi.clear();
}
//#endregion
//#region src/chronicle-format.ts
function X(e, t) {
	let n = e[t];
	return typeof n == "number" ? n : void 0;
}
function Zi(e, t) {
	let n = e[t];
	return typeof n == "string" ? n : void 0;
}
function Qi(e, t) {
	let n = e[t];
	return typeof n == "boolean" ? n : void 0;
}
function $i(e, t) {
	let n = e[t];
	return Array.isArray(n) ? n.filter((e) => typeof e == "number") : [];
}
function ea(e) {
	let t = e.shock;
	if (typeof t == "object" && t && "kind" in t) return t;
}
var ta = [
	"births",
	"deaths",
	"pairings",
	"community",
	"cooperation",
	"antagonism",
	"famine",
	"other"
], na = new Set(Object.values(q)), ra = new Set([
	Y.GIFT,
	Y.SHARE,
	Y.HELP,
	Y.TEACH,
	Y.TRADE
]), ia = new Set([
	Y.STEAL,
	Y.STEAL_DETECTED,
	Y.SABOTAGE,
	Y.RUMOR,
	Y.ATTACK
]), aa = new Set(Object.values(Ci));
function oa(e) {
	return e === J.BIRTH ? "births" : e === J.DEATH ? "deaths" : e === J.BONDED ? "pairings" : na.has(e) ? "community" : ra.has(e) ? "cooperation" : ia.has(e) ? "antagonism" : e === vi.ONSET || aa.has(e) ? "famine" : "other";
}
function sa(e) {
	switch (e.ontology) {
		case J.BONDED: return [X(e, "partnerAId"), X(e, "partnerBId")].filter((e) => e !== void 0);
		case J.BIRTH: return [
			X(e, "childId"),
			X(e, "parentAId"),
			X(e, "parentBId")
		].filter((e) => e !== void 0);
		case J.DEATH:
		case J.STAGE_CHANGED:
		case vi.ONSET: {
			let t = X(e, "agentId");
			return t === void 0 ? [] : [t];
		}
		case q.FORMED:
		case q.MERGED:
		case q.DISSOLVED: return $i(e, "memberIds");
		case q.JOINED:
		case q.LEFT: {
			let t = X(e, "agentId");
			return t === void 0 ? [] : [t];
		}
		case q.SPLIT: return [
			...$i(e, "keptMemberIds"),
			...$i(e, "newMemberIds"),
			...$i(e, "strandedAgentIds")
		];
		case Y.SHARE: {
			let t = X(e, "actorId");
			return t === void 0 ? [] : [t];
		}
		case Y.GIFT:
		case Y.HELP:
		case Y.TEACH:
		case Y.TRADE:
		case Y.STEAL:
		case Y.STEAL_DETECTED:
		case Y.SABOTAGE:
		case Y.RUMOR:
		case Y.ATTACK: return [X(e, "actorId"), X(e, "targetId")].filter((e) => e !== void 0);
		default: return [];
	}
}
function Z(e) {
	return e === void 0 ? "someone" : Gr(e);
}
function ca(e) {
	return e === "oldAge" ? "old age" : e === "starvation" ? "starvation" : e === "violence" ? "violence" : "unknown cause";
}
function la(e) {
	return /^[aeiou]/i.test(e) ? "an" : "a";
}
function ua(e) {
	let t = e.ontology;
	switch (t) {
		case J.BONDED: {
			let t = X(e, "partnerAId"), n = X(e, "partnerBId");
			return `${Z(t)} and ${Z(n)} bond`;
		}
		case J.BIRTH: {
			let t = X(e, "childId"), n = X(e, "parentAId"), r = X(e, "parentBId");
			return `${Z(n)} and ${Z(r)} welcome ${Z(t)}`;
		}
		case J.DEATH: {
			let t = X(e, "agentId"), n = Zi(e, "cause");
			return `${Z(t)} dies (${ca(n)})`;
		}
		case J.STAGE_CHANGED: {
			let t = X(e, "agentId"), n = Zi(e, "stage") ?? "adult";
			return `${Z(t)} grows into ${la(n)} ${n}`;
		}
		case q.FORMED: {
			let t = X(e, "communityId"), n = $i(e, "memberIds");
			return `Community #${t ?? "?"} forms (${n.length} members)`;
		}
		case q.JOINED: {
			let t = X(e, "communityId");
			return `${Z(X(e, "agentId"))} joins community #${t ?? "?"}`;
		}
		case q.LEFT: {
			let t = X(e, "communityId");
			return `${Z(X(e, "agentId"))} leaves community #${t ?? "?"}`;
		}
		case q.SPLIT: {
			let t = X(e, "originalId"), n = X(e, "newId");
			return `Community #${t ?? "?"} splits into #${t ?? "?"} and #${n ?? "?"}`;
		}
		case q.MERGED: {
			let t = X(e, "keptId");
			return `Community #${X(e, "absorbedId") ?? "?"} merges into #${t ?? "?"}`;
		}
		case q.DISSOLVED: return `Community #${X(e, "communityId") ?? "?"} dissolves`;
		case Y.GIFT: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Zi(e, "good") ?? "goods";
			return `${Z(t)} gifts ${r} to ${Z(n)}`;
		}
		case Y.SHARE: {
			let t = X(e, "actorId"), n = X(e, "communityId"), r = Zi(e, "good") ?? "goods";
			return `${Z(t)} shares ${r} with community #${n ?? "?"}`;
		}
		case Y.HELP: {
			let t = X(e, "actorId"), n = X(e, "targetId");
			return `${Z(t)} helps ${Z(n)}`;
		}
		case Y.TEACH: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Zi(e, "skill") ?? "a skill";
			return `${Z(t)} teaches ${Z(n)} ${r}`;
		}
		case Y.TRADE: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Qi(e, "accepted");
			return `${Z(t)} trades with ${Z(n)}${r === !1 ? " (declined)" : ""}`;
		}
		case Y.STEAL: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Qi(e, "detected");
			return `${Z(t)} steals from ${Z(n)}${r ? " (caught)" : ""}`;
		}
		case Y.STEAL_DETECTED: {
			let t = X(e, "actorId");
			return `${Z(X(e, "targetId"))} catches ${Z(t)} stealing`;
		}
		case Y.SABOTAGE: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Qi(e, "detected");
			return `${Z(t)} sabotages ${Z(n)}${r ? " (caught)" : ""}`;
		}
		case Y.RUMOR: {
			let t = X(e, "actorId"), n = X(e, "targetId");
			return `${Z(t)} spreads a rumor about ${Z(n)}`;
		}
		case Y.ATTACK: {
			let t = X(e, "actorId"), n = X(e, "targetId"), r = Qi(e, "lethal");
			return `${Z(t)} attacks ${Z(n)}${r ? " (fatal)" : ""}`;
		}
		case vi.ONSET: return `${Z(X(e, "agentId"))} begins starving`;
		case Ci.FAMINE: {
			let t = ea(e);
			return `Famine strikes: ${t?.resourceKind ?? "resource"} regen x${t ? t.factor.toFixed(2) : "?"} for ${t?.durationTicks ?? "?"} ticks`;
		}
		case Ci.BOOM: {
			let t = ea(e);
			return `Boom: ${t?.resourceKind ?? "resource"} regen x${t ? t.factor.toFixed(2) : "?"} for ${t?.durationTicks ?? "?"} ticks`;
		}
		case Ci.DISASTER: return `Disaster destroys a ${ea(e)?.resourceKind ?? "resource"} node`;
		case Ci.PLAGUE: {
			let t = ea(e);
			return `Plague drains ${t?.need ?? "a need"} (${t ? t.amountPerTick : "?"}/tick for ${t?.durationTicks ?? "?"} ticks)`;
		}
		default: return `Event: ${t}`;
	}
}
function da(e, t) {
	return `Y${t.ticksPerDay > 0 ? Math.floor(e.tick / t.ticksPerDay) : 0}  ${ua(e)}`;
}
//#endregion
//#region src/chronicle-panel.ts
var fa = {
	births: "Births",
	deaths: "Deaths",
	pairings: "Pairings",
	community: "Community",
	cooperation: "Cooperation",
	antagonism: "Antagonism",
	famine: "Famine/Shock",
	other: "Other"
}, pa = {
	births: "green",
	deaths: "red",
	pairings: "hotPink",
	community: "skyBlue",
	cooperation: "gold",
	antagonism: "orange",
	famine: "rust",
	other: "steel"
};
function ma(e, t) {
	let n = document.createElement(e);
	return n.className = t, n;
}
function ha(e) {
	let t = ma("div", "hollow-chronicle-panel");
	t.style.background = z.ink, t.style.color = z.cream, t.style.borderRight = `2px solid ${z.navy}`;
	let n = ma("h2", "hollow-chronicle-title");
	n.textContent = "Chronicle", n.style.color = z.gold, t.appendChild(n);
	let r = new Set(ta), i = ma("div", "hollow-chronicle-filters"), a = /* @__PURE__ */ new Map();
	function o(e) {
		let t = a.get(e);
		if (!t) return;
		let n = r.has(e);
		t.style.color = n ? z.ink : z.steel, t.style.background = n ? z[pa[e]] : z.navy, t.setAttribute("aria-pressed", String(n));
	}
	for (let e of ta) {
		let t = document.createElement("button");
		t.type = "button", t.className = "hollow-chronicle-chip", t.textContent = fa[e], t.addEventListener("click", () => {
			r.has(e) ? r.delete(e) : r.add(e), o(e), u();
		}), a.set(e, t), o(e), i.appendChild(t);
	}
	t.appendChild(i);
	let s = ma("div", "hollow-chronicle-list");
	t.appendChild(s);
	let c = [];
	function l(e, t) {
		e.style.display = r.has(t) ? "" : "none";
	}
	function u() {
		for (let e of c) l(e.el, e.category);
	}
	function d() {
		for (; c.length > 300;) {
			let e = c.shift();
			e && s.removeChild(e.el);
		}
	}
	function f() {
		return s.scrollHeight - s.scrollTop - s.clientHeight < 24;
	}
	function p(t) {
		let n = oa(t.ontology), r = ma("div", "hollow-chronicle-row");
		r.textContent = da(t, { ticksPerDay: e.ticksPerDay }), r.style.color = z.cream, r.style.borderLeft = `3px solid ${z[pa[n]]}`;
		let i = sa(t)[0];
		i !== void 0 && (r.style.cursor = "pointer", r.addEventListener("click", () => e.onSelectAgent(i))), c.push({
			el: r,
			category: n
		}), l(r, n), s.appendChild(r);
	}
	function m(e) {
		let t = f();
		for (let t of e) p(t);
		d(), t && (s.scrollTop = s.scrollHeight);
	}
	m(Gi());
	let h = Ji((e) => m(e));
	return {
		el: t,
		dispose() {
			h();
		}
	};
}
//#endregion
//#region src/metrics-data.ts
function ga(e, t) {
	return e.map((e) => Oi(e)[t] ?? 0);
}
function _a(e) {
	if (e.length === 0) return {
		min: 0,
		max: 1
	};
	let t = e[0], n = e[0];
	for (let r of e) r < t && (t = r), r > n && (n = r);
	if (t === n) {
		let e = t === 0 ? 1 : Math.abs(t) * .5;
		return {
			min: t - e,
			max: n + e
		};
	}
	return {
		min: t,
		max: n
	};
}
function va(e) {
	return Number.isInteger(e) ? String(e) : e.toFixed(2);
}
//#endregion
//#region src/chart-draw.ts
var ya = 1.5;
function ba(e, t, n) {
	e.clearRect(0, 0, n.width, n.height), e.fillStyle = z.ink, e.fillRect(0, 0, n.width, n.height);
	for (let r of t) {
		if (r.values.length < 2) continue;
		let t = _a(r.values), i = t.max - t.min;
		e.strokeStyle = z[r.colorRole], e.lineWidth = ya, e.beginPath();
		let a = r.values.length - 1;
		r.values.forEach((r, o) => {
			let s = o / a * n.width, c = n.height - (r - t.min) / i * n.height;
			o === 0 ? e.moveTo(s, c) : e.lineTo(s, c);
		}), e.stroke();
	}
}
//#endregion
//#region src/dashboard-panel.ts
var xa = [
	{
		title: "Population",
		series: [{
			column: "population",
			label: "population",
			colorRole: "cream"
		}]
	},
	{
		title: "Births & deaths (per window)",
		series: [
			{
				column: "births_window",
				label: "births",
				colorRole: "green"
			},
			{
				column: "deaths_oldAge_window",
				label: "old age",
				colorRole: "steel"
			},
			{
				column: "deaths_starvation_window",
				label: "starvation",
				colorRole: "orange"
			},
			{
				column: "deaths_violence_window",
				label: "violence",
				colorRole: "red"
			}
		]
	},
	{
		title: "Communities",
		series: [{
			column: "community_count",
			label: "count",
			colorRole: "skyBlue"
		}, {
			column: "community_mean_size",
			label: "mean size",
			colorRole: "cyan"
		}]
	},
	{
		title: "Trust & wealth",
		series: [{
			column: "mean_pairwise_trust",
			label: "mean trust",
			colorRole: "gold"
		}, {
			column: "wealth_gini",
			label: "wealth gini",
			colorRole: "mauve"
		}]
	},
	{
		title: "Cooperation vs antagonism (per window)",
		series: [{
			column: "coop_window",
			label: "cooperative",
			colorRole: "green"
		}, {
			column: "antag_window",
			label: "antagonistic",
			colorRole: "red"
		}]
	},
	{
		title: "Feuds & disease (per window)",
		series: [{
			column: "feud_active_dyads",
			label: "active feuds",
			colorRole: "red"
		}, {
			column: "deaths_disease_window",
			label: "disease deaths",
			colorRole: "mauve"
		}]
	},
	{
		title: "Gene drift (mean)",
		series: [
			{
				column: "mean_gene_sociability",
				label: "sociability",
				colorRole: "cyan"
			},
			{
				column: "mean_gene_aggression",
				label: "aggression",
				colorRole: "red"
			},
			{
				column: "mean_gene_greed",
				label: "greed",
				colorRole: "gold"
			},
			{
				column: "mean_gene_industriousness",
				label: "industriousness",
				colorRole: "greenMid"
			}
		]
	}
], Sa = 300, Ca = 70;
function wa(e, t) {
	let n = document.createElement(e);
	return n.className = t, n;
}
function Ta() {
	let e = wa("div", "hollow-dashboard-panel");
	e.style.background = z.ink, e.style.color = z.cream, e.style.borderLeft = `2px solid ${z.navy}`;
	let t = wa("h2", "hollow-dashboard-title");
	t.textContent = "Metrics", t.style.color = z.gold, e.appendChild(t);
	let n = [];
	for (let t of xa) {
		let r = wa("div", "hollow-dashboard-chart"), i = wa("h4", "hollow-dashboard-chart-title");
		i.textContent = t.title, i.style.color = z.silver, r.appendChild(i);
		let a = document.createElement("canvas");
		a.className = "hollow-dashboard-canvas", a.width = Sa, a.height = Ca, r.appendChild(a);
		let o = wa("div", "hollow-dashboard-legend"), s = [];
		for (let e of t.series) {
			let t = wa("span", "hollow-dashboard-legend-item"), n = wa("span", "hollow-dashboard-legend-swatch");
			n.style.background = z[e.colorRole];
			let r = document.createElement("span");
			r.textContent = `${e.label}: `, r.style.color = z.steel;
			let i = document.createElement("span");
			i.className = "hollow-dashboard-legend-value", i.style.color = z.cream, i.textContent = "—", t.appendChild(n), t.appendChild(r), t.appendChild(i), o.appendChild(t), s.push(i);
		}
		r.appendChild(o), e.appendChild(r), n.push({
			config: t,
			canvas: a,
			legendValueEls: s
		});
	}
	function r() {
		let e = qi(), t = e[e.length - 1];
		for (let r of n) {
			let n = r.config.series.map((t) => ({
				values: ga(e, t.column),
				colorRole: t.colorRole
			})), i = r.canvas.getContext("2d");
			i && ba(i, n, {
				width: Sa,
				height: Ca
			}), r.config.series.forEach((e, n) => {
				let i = r.legendValueEls[n];
				if (!i) return;
				let a = t ? ga([t], e.column)[0] ?? 0 : 0;
				i.textContent = t ? va(a) : "—";
			});
		}
	}
	r();
	let i = Yi(() => r());
	return {
		el: e,
		dispose() {
			i();
		}
	};
}
//#endregion
//#region src/export-panel.ts
function Ea(e, t) {
	let n = document.createElement(e);
	return n.className = t, n;
}
function Da(e, t) {
	let n = Ea("button", "hollow-export-button");
	return n.type = "button", n.textContent = e, n.style.color = z.cream, n.style.background = z.slate, n.addEventListener("click", t), n;
}
function Oa(e, t, n, r = document) {
	let i = new Blob([t], { type: n }), a = URL.createObjectURL(i), o = r.createElement("a");
	o.href = a, o.download = e, r.body.appendChild(o), o.click(), o.remove(), URL.revokeObjectURL(a);
}
function ka(e) {
	return e === 0 ? "" : `events.jsonl is missing the oldest ${e} event${e === 1 ? "" : "s"} (chronicle buffer cap reached)`;
}
function Aa(e) {
	let t = Ea("div", "hollow-export-panel"), n = Da("Export metrics.csv", () => {
		Oa("metrics.csv", Ai(qi()), "text/csv");
	}), r = Da("Export events.jsonl", () => {
		Oa("events.jsonl", ji(Gi()), "application/jsonl");
	}), i = Ea("div", "hollow-export-dropped-note");
	i.style.color = z.rust;
	function a() {
		let e = ka(Ki());
		i.textContent = e, i.hidden = e === "";
	}
	a(), Ji(a);
	let o = Da("Export lineage.json", () => {
		e.requestLineage().then((e) => {
			Oa("lineage.json", Mi(e), "application/json");
		});
	});
	return t.appendChild(n), t.appendChild(r), t.appendChild(i), t.appendChild(o), t;
}
//#endregion
//#region ../sim-core/src/persona/presets.ts
var ja = {
	cooperator: {
		label: "Cooperator",
		behavior: {
			sociability: .85,
			loyalty: .85,
			greed: .15,
			aggression: .15
		}
	},
	opportunist: {
		label: "Opportunist",
		behavior: {
			greed: .85,
			risk: .85
		}
	},
	hoarder: {
		label: "Hoarder",
		behavior: {
			greed: .9,
			loyalty: .15
		}
	},
	loner: {
		label: "Loner",
		behavior: { sociability: .1 }
	},
	nurturer: {
		label: "Nurturer",
		behavior: {
			loyalty: .85,
			sociability: .8,
			curiosity: .8
		}
	}
}, Ma = 1708288, Na = 8;
function Pa(e, t = 0) {
	return {
		preset: e,
		count: t,
		behavior: {},
		aptitude: {},
		appearance: {},
		lock: []
	};
}
function Fa() {
	return {
		seed: Ma,
		archetypes: Object.keys(ja).map((e) => Pa(e, Na))
	};
}
function Ia(e, t) {
	return {
		...e,
		seed: t
	};
}
function La(e, t, n) {
	return {
		...e,
		archetypes: e.archetypes.map((e, r) => r === t ? n : e)
	};
}
function Ra(e, t) {
	return {
		...e,
		count: Math.max(0, Math.floor(t))
	};
}
function za(e, t) {
	let n = e.lock.includes(t);
	return {
		...e,
		lock: n ? e.lock.filter((e) => e !== t) : [...e.lock, t]
	};
}
function Ba(e, t, n) {
	return {
		...e,
		behavior: {
			...e.behavior,
			[t]: n
		}
	};
}
function Va(e, t, n) {
	return {
		...e,
		aptitude: {
			...e.aptitude,
			[t]: n
		}
	};
}
function Ha(e, t, n) {
	return {
		...e,
		appearance: {
			...e.appearance,
			[t]: n
		}
	};
}
function Ua(e, t, n) {
	return {
		...e,
		appearance: {
			...e.appearance,
			[t]: n
		}
	};
}
function Wa(e, t, n) {
	return Math.round((t + e() * (n - t)) * 1e3) / 1e3;
}
function Ga(e, t) {
	return t[Math.min(t.length - 1, Math.floor(e() * t.length))];
}
function Ka(e, t = Math.random) {
	let n = new Set(e.lock), r = { ...e.behavior };
	for (let e of yn) n.has(e) || (r[e] = Wa(t, 0, 1));
	let i = { ...e.aptitude };
	for (let e of bn) n.has(e) || (i[e] = Wa(t, 0, 1));
	let a = { ...e.appearance };
	return n.has("height") || (a.height = Wa(t, xn, Sn)), n.has("build") || (a.build = Wa(t, Cn, wn)), n.has("skinTone") || (a.skinTone = Ga(t, Tn)), n.has("hairTone") || (a.hairTone = Ga(t, En)), {
		...e,
		behavior: r,
		aptitude: i,
		appearance: a
	};
}
function qa(e) {
	return Object.keys(e).length > 0 ? e : void 0;
}
function Ja(e) {
	let t = qa(e.behavior), n = qa(e.aptitude), r = qa(e.appearance), i = e.lock.length > 0 ? [...e.lock] : void 0;
	if (!(!t && !n && !r && !i)) return {
		...t ? { behavior: t } : {},
		...n ? { aptitude: n } : {},
		...r ? { appearance: r } : {},
		...i ? { lock: i } : {}
	};
}
function Ya(e) {
	let t = e.archetypes.filter((e) => e.count > 0).map((e) => {
		let t = Ja(e);
		return {
			preset: e.preset,
			count: e.count,
			...t ? { overrides: t } : {}
		};
	});
	return {
		seed: e.seed,
		...t.length > 0 ? { archetypes: t } : {},
		...e.foodNodeCount === void 0 ? {} : { foodNodeCount: e.foodNodeCount },
		...e.foodNodeMaxStock === void 0 ? {} : { foodNodeMaxStock: e.foodNodeMaxStock },
		...e.foodNodeRegenPerTick === void 0 ? {} : { foodNodeRegenPerTick: e.foodNodeRegenPerTick },
		...e.materialNodeCount === void 0 ? {} : { materialNodeCount: e.materialNodeCount },
		...e.materialNodeMaxStock === void 0 ? {} : { materialNodeMaxStock: e.materialNodeMaxStock },
		...e.materialNodeRegenPerTick === void 0 ? {} : { materialNodeRegenPerTick: e.materialNodeRegenPerTick }
	};
}
//#endregion
//#region src/persona-setup-panel.ts
function Q(e, t, n) {
	let r = document.createElement(e);
	return r.className = t, n !== void 0 && (r.textContent = n), r;
}
function Xa(e) {
	return e.toFixed(2);
}
function Za(e, t, n, r, i) {
	let a = document.createElement("input");
	return a.type = "range", a.min = String(t), a.max = String(n), a.step = String(r), a.value = String(e), a.addEventListener("input", () => i(Number(a.value))), a;
}
function Qa(e, t, n) {
	let r = document.createElement("input");
	return r.type = "number", r.placeholder = t, e !== void 0 && (r.value = String(e)), r.addEventListener("change", () => {
		n(r.value === "" ? void 0 : Number(r.value));
	}), r;
}
function $a(e) {
	let t = Fa(), n = Q("div", "hollow-setup-panel");
	n.style.background = z.ink, n.style.color = z.cream;
	let r = Q("h1", "hollow-setup-title", "Found the Hollow");
	r.style.color = z.gold, n.appendChild(r);
	let i = Q("p", "hollow-setup-subtitle", "Choose your founders' archetypes, fine-tune their genes, set a seed, then start the town.");
	i.style.color = z.steel, n.appendChild(i);
	let a = Q("div", "hollow-setup-row"), o = Q("label", "hollow-setup-label", "Seed");
	o.style.color = z.silver;
	let s = document.createElement("input");
	s.type = "number", s.value = String(t.seed), s.addEventListener("change", () => {
		t = Ia(t, Number(s.value) || 0);
	}), a.appendChild(o), a.appendChild(s), n.appendChild(a);
	let c = Q("div", "hollow-setup-section"), l = Q("h3", "hollow-setup-section-title", "Resource density (blank = default)");
	l.style.color = z.silver, c.appendChild(l);
	for (let e of [
		{
			key: "foodNodeCount",
			label: "food nodes"
		},
		{
			key: "foodNodeMaxStock",
			label: "food max stock"
		},
		{
			key: "foodNodeRegenPerTick",
			label: "food regen/tick"
		},
		{
			key: "materialNodeCount",
			label: "material nodes"
		},
		{
			key: "materialNodeMaxStock",
			label: "material max stock"
		},
		{
			key: "materialNodeRegenPerTick",
			label: "material regen/tick"
		}
	]) {
		let n = Q("div", "hollow-setup-row"), r = Q("label", "hollow-setup-label", e.label);
		r.style.color = z.silver;
		let i = Qa(t[e.key], "default", (n) => {
			t = {
				...t,
				[e.key]: n
			};
		});
		n.appendChild(r), n.appendChild(i), c.appendChild(n);
	}
	n.appendChild(c);
	let u = Q("div", "hollow-setup-section"), d = Q("h3", "hollow-setup-section-title", "Founders");
	d.style.color = z.silver, u.appendChild(d), t.archetypes.forEach((e, t) => {
		u.appendChild(f(e, t));
	}), n.appendChild(u);
	function f(e, n) {
		let r = ja[e.preset], i = Q("div", "hollow-setup-archetype-row");
		i.style.borderTop = `1px solid ${z.navy}`;
		let a = Q("div", "hollow-setup-archetype-header"), o = Q("span", "hollow-setup-archetype-label", r?.label ?? e.preset);
		o.style.color = z.cream;
		let s = document.createElement("input");
		s.type = "number", s.min = "0", s.value = String(e.count), s.addEventListener("change", () => {
			let e = t.archetypes[n];
			t = La(t, n, Ra(e, Number(s.value) || 0));
		});
		let c = Q("button", "hollow-setup-tune-btn", "Tune genes ▾");
		c.type = "button", c.style.color = z.cream, c.style.background = z.slate;
		let l = Q("button", "hollow-setup-randomize-btn", "Randomize unlocked");
		l.type = "button", l.style.color = z.cream, l.style.background = z.mauve, a.appendChild(o), a.appendChild(s), a.appendChild(c), a.appendChild(l), i.appendChild(a);
		let u = Q("div", "hollow-setup-gene-panel");
		u.style.display = "none", i.appendChild(u);
		let d = null;
		return c.addEventListener("click", () => {
			let e = u.style.display === "none";
			u.style.display = e ? "block" : "none", c.textContent = e ? "Tune genes ▴" : "Tune genes ▾", e && u.childNodes.length === 0 && (d = p(u, n));
		}), l.addEventListener("click", () => {
			let e = t.archetypes[n];
			t = La(t, n, Ka(e)), d?.();
		}), i;
	}
	function p(e, n) {
		let r = [];
		function i(e, i, a, o, s, c, l) {
			let u = Q("div", "hollow-setup-gene-row"), d = Q("span", "hollow-setup-gene-label", e);
			d.style.color = z.silver;
			let f = () => a(t.archetypes[n]) ?? (s + c) / 2, p = Q("span", "hollow-setup-gene-value", Xa(f()));
			p.style.color = z.cream;
			let m = Za(f(), s, c, l, (e) => {
				let r = t.archetypes[n];
				t = La(t, n, o(r, e)), p.textContent = Xa(e);
			}), h = document.createElement("label");
			h.className = "hollow-setup-lock-label";
			let g = document.createElement("input");
			return g.type = "checkbox", g.checked = t.archetypes[n].lock.includes(i), g.addEventListener("change", () => {
				let e = t.archetypes[n];
				t = La(t, n, za(e, i));
			}), h.appendChild(g), h.appendChild(document.createTextNode(" lock")), u.appendChild(d), u.appendChild(m), u.appendChild(p), u.appendChild(h), r.push(() => {
				let e = f();
				m.value = String(e), p.textContent = Xa(e), g.checked = t.archetypes[n].lock.includes(i);
			}), u;
		}
		function a(e, i, a, o, s) {
			let c = Q("div", "hollow-setup-gene-row"), l = Q("span", "hollow-setup-gene-label", e);
			l.style.color = z.silver;
			let u = document.createElement("select"), d = document.createElement("option");
			d.value = "", d.textContent = "(random)", u.appendChild(d);
			for (let e of a) {
				let t = document.createElement("option");
				t.value = e, t.textContent = e, u.appendChild(t);
			}
			u.value = o(t.archetypes[n]) ?? "", u.addEventListener("change", () => {
				if (u.value === "") return;
				let e = t.archetypes[n];
				t = La(t, n, s(e, u.value));
			});
			let f = document.createElement("label");
			f.className = "hollow-setup-lock-label";
			let p = document.createElement("input");
			return p.type = "checkbox", p.checked = t.archetypes[n].lock.includes(i), p.addEventListener("change", () => {
				let e = t.archetypes[n];
				t = La(t, n, za(e, i));
			}), f.appendChild(p), f.appendChild(document.createTextNode(" lock")), c.appendChild(l), c.appendChild(u), c.appendChild(f), r.push(() => {
				u.value = o(t.archetypes[n]) ?? "", p.checked = t.archetypes[n].lock.includes(i);
			}), c;
		}
		for (let t of yn) e.appendChild(i(t, t, (e) => e.behavior[t], (e, n) => Ba(e, t, n), 0, 1, .01));
		for (let t of bn) e.appendChild(i(`${t} aptitude`, t, (e) => e.aptitude[t], (e, n) => Va(e, t, n), 0, 1, .01));
		return e.appendChild(i("height", "height", (e) => e.appearance.height, (e, t) => Ha(e, "height", t), xn, Sn, .01)), e.appendChild(i("build", "build", (e) => e.appearance.build, (e, t) => Ha(e, "build", t), Cn, wn, .01)), e.appendChild(a("skin tone", "skinTone", Tn, (e) => e.appearance.skinTone, (e, t) => Ua(e, "skinTone", t))), e.appendChild(a("hair tone", "hairTone", En, (e) => e.appearance.hairTone, (e, t) => Ua(e, "hairTone", t))), () => {
			for (let e of r) e();
		};
	}
	let m = Q("button", "hollow-setup-start-btn", "Start");
	return m.type = "button", m.style.color = z.ink, m.style.background = z.gold, m.addEventListener("click", () => {
		e.onStart(Ya(t));
	}), n.appendChild(m), n;
}
//#endregion
//#region src/time-control.ts
var eo = [
	1,
	2,
	4,
	8
];
//#endregion
//#region src/time-control-panel.ts
function to(e, t, n) {
	let r = document.createElement(e);
	return r.className = t, n !== void 0 && (r.textContent = n), r;
}
function no(e) {
	let t = !1, n = 1, r = to("div", "hollow-time-control-panel");
	r.style.background = z.ink, r.style.color = z.cream, r.style.borderBottom = `2px solid ${z.navy}`;
	let i = to("button", "hollow-time-control-button", "Pause");
	i.type = "button", i.style.color = z.cream;
	let a = to("button", "hollow-time-control-button", "Step");
	a.type = "button", a.style.color = z.cream;
	function o() {
		i.textContent = t ? "Resume" : "Pause", i.style.background = t ? z.gold : z.slate, a.style.background = t ? z.slate : z.navy, a.disabled = !t;
	}
	o(), i.addEventListener("click", () => {
		t = !t, o(), e.onSetPaused(t);
	}), a.addEventListener("click", () => {
		t && e.onStep();
	});
	let s = to("div", "hollow-time-control-speed-group"), c = /* @__PURE__ */ new Map();
	function l() {
		for (let [e, t] of c) {
			let r = e === n;
			t.style.color = r ? z.ink : z.steel, t.style.background = r ? z.gold : z.navy, t.setAttribute("aria-pressed", String(r));
		}
	}
	for (let t of eo) {
		let r = to("button", "hollow-time-control-speed-button", `${t}x`);
		r.type = "button", r.addEventListener("click", () => {
			n = t, l(), e.onSetSpeed(n);
		}), c.set(t, r), s.appendChild(r);
	}
	return l(), r.appendChild(i), r.appendChild(a), r.appendChild(s), { el: r };
}
//#endregion
//#region src/shock-form.ts
var ro = [
	"famine",
	"boom",
	"disaster",
	"plague"
];
function io(e = "famine") {
	return {
		kind: e,
		resourceKind: "food",
		factor: e === "boom" ? 2 : .3,
		durationTicks: 120,
		need: Vr,
		amountPerTick: 1
	};
}
function ao(e) {
	switch (e.kind) {
		case "famine": return {
			kind: "famine",
			resourceKind: e.resourceKind,
			factor: e.factor,
			durationTicks: e.durationTicks
		};
		case "boom": return {
			kind: "boom",
			resourceKind: e.resourceKind,
			factor: e.factor,
			durationTicks: e.durationTicks
		};
		case "disaster": return {
			kind: "disaster",
			resourceKind: e.resourceKind
		};
		case "plague": return {
			kind: "plague",
			need: e.need,
			amountPerTick: e.amountPerTick,
			durationTicks: e.durationTicks
		};
	}
}
//#endregion
//#region src/shock-panel.ts
var oo = {
	famine: "Famine",
	boom: "Boom",
	disaster: "Disaster",
	plague: "Plague"
}, so = ["food", "material"];
function $(e, t, n) {
	let r = document.createElement(e);
	return r.className = t, n !== void 0 && (r.textContent = n), r;
}
function co(e) {
	let t = io(), n = $("div", "hollow-shock-panel");
	n.style.background = z.ink, n.style.color = z.cream, n.style.borderBottom = `2px solid ${z.navy}`;
	let r = $("div", "hollow-shock-kind-group"), i = /* @__PURE__ */ new Map(), a = $("div", "hollow-shock-row"), o = $("label", "hollow-shock-label", "resource");
	o.style.color = z.steel;
	let s = document.createElement("select");
	for (let e of so) {
		let t = document.createElement("option");
		t.value = e, t.textContent = e, s.appendChild(t);
	}
	s.value = t.resourceKind, s.addEventListener("change", () => {
		t = {
			...t,
			resourceKind: s.value
		};
	}), a.appendChild(o), a.appendChild(s);
	let c = $("div", "hollow-shock-row"), l = $("label", "hollow-shock-label", "factor");
	l.style.color = z.steel;
	let u = document.createElement("input");
	u.type = "number", u.step = "0.1", u.min = "0", u.value = String(t.factor), u.addEventListener("change", () => {
		t = {
			...t,
			factor: Number(u.value) || 0
		};
	}), c.appendChild(l), c.appendChild(u);
	let d = $("div", "hollow-shock-row"), f = $("label", "hollow-shock-label", "duration (ticks)");
	f.style.color = z.steel;
	let p = document.createElement("input");
	p.type = "number", p.min = "1", p.value = String(t.durationTicks), p.addEventListener("change", () => {
		t = {
			...t,
			durationTicks: Number(p.value) || 1
		};
	}), d.appendChild(f), d.appendChild(p);
	let m = $("div", "hollow-shock-row"), h = $("label", "hollow-shock-label", "need (plague)");
	h.style.color = z.steel;
	let g = document.createElement("input");
	g.type = "text", g.value = t.need, g.addEventListener("change", () => {
		t = {
			...t,
			need: g.value
		};
	}), m.appendChild(h), m.appendChild(g);
	let _ = $("div", "hollow-shock-row"), v = $("label", "hollow-shock-label", "amount/tick (plague)");
	v.style.color = z.steel;
	let y = document.createElement("input");
	y.type = "number", y.step = "0.1", y.value = String(t.amountPerTick), y.addEventListener("change", () => {
		t = {
			...t,
			amountPerTick: Number(y.value) || 0
		};
	}), _.appendChild(v), _.appendChild(y);
	function b() {
		for (let [e, n] of i) {
			let r = e === t.kind;
			n.style.color = r ? z.ink : z.steel, n.style.background = r ? z.rust : z.navy, n.setAttribute("aria-pressed", String(r));
		}
		c.style.display = t.kind === "disaster" ? "none" : "", d.style.display = t.kind === "disaster" ? "none" : "", m.style.display = t.kind === "plague" ? "" : "none", _.style.display = t.kind === "plague" ? "" : "none";
	}
	for (let e of ro) {
		let n = $("button", "hollow-shock-kind-button", oo[e]);
		n.type = "button", n.addEventListener("click", () => {
			t = io(e), s.value = t.resourceKind, u.value = String(t.factor), p.value = String(t.durationTicks), g.value = t.need, y.value = String(t.amountPerTick), b();
		}), i.set(e, n), r.appendChild(n);
	}
	b();
	let x = $("button", "hollow-shock-fire-button", "Fire shock");
	return x.type = "button", x.style.color = z.ink, x.style.background = z.red, x.addEventListener("click", () => {
		e.onFireShock(ao(t));
	}), n.appendChild(r), n.appendChild(a), n.appendChild(c), n.appendChild(d), n.appendChild(m), n.appendChild(_), n.appendChild(x), n;
}
//#endregion
//#region src/run-descriptor.ts
function lo(e) {
	let t = "";
	for (let n of e) t += String.fromCharCode(n);
	return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function uo(e) {
	let t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t + "=".repeat((4 - t.length % 4) % 4), r = atob(n), i = new Uint8Array(r.length);
	for (let e = 0; e < r.length; e++) i[e] = r.charCodeAt(e);
	return i;
}
function fo(e) {
	let t = JSON.stringify(e);
	return lo(new TextEncoder().encode(t));
}
function po(e) {
	let t = new TextDecoder().decode(uo(e));
	return JSON.parse(t);
}
//#endregion
//#region src/mount.ts
var mo = 200;
function ho() {
	let e = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
	if (!e) return null;
	try {
		return po(e);
	} catch {
		return null;
	}
}
function go(t, n) {
	let r = document.createElement("div");
	r.className = "hollow-root", r.style.background = z.black, r.style.color = z.white, r.tabIndex = -1;
	let i = document.createElement("style");
	i.textContent = e, r.appendChild(i);
	let a = document.createElement("canvas");
	a.className = "hollow-scene", r.appendChild(a), t.appendChild(r);
	let o = () => r.focus({ preventScroll: !0 });
	r.addEventListener("pointerdown", o), Xi();
	let s = new Worker(new URL(
		/* @vite-ignore */
		"" + new URL("assets/sim-worker-DO1iKn-T.js", import.meta.url).href,
		"" + import.meta.url
	), { type: "module" }), c = null, l = !1;
	function u(e) {
		let t = e.seed, i = e.persona ?? {}, l = {
			type: "init",
			seed: e.seed,
			ticksPerDay: mo,
			...e.persona ? { persona: e.persona } : {},
			...e.replayLog ? { replayLog: e.replayLog } : {}
		};
		s.postMessage(l);
		let u = null, d = null, f = null, p = null, m = null, h = !1, g = !1;
		function _() {
			m &&= (m.remove(), null);
		}
		function v(e) {
			p = e, _(), m = _i(e, {
				onClose: y,
				onToggleFollow: b,
				isFollowing: f === e.id
			}), r.appendChild(m);
		}
		function y() {
			d = null, f = null, p = null, C.setSelectedAgent(null), C.setFollow(null), _();
		}
		function b() {
			d !== null && (f === d ? (f = null, C.setFollow(null)) : (f = d, C.setFollow(d)), p && v(p));
		}
		function x(e) {
			f !== null && (f = null, C.setFollow(null)), d = e, p = null, C.setSelectedAgent(e);
			let t = {
				type: "inspect",
				agentId: e
			};
			s.postMessage(t);
			let n = C.getAgentRenderState();
			n !== null && n.has(e) && (f = e, C.setFollow(e));
		}
		function S(e) {
			if (f !== null && (f = null, C.setFollow(null)), d = e, p = null, e === null) {
				_();
				return;
			}
			let t = {
				type: "inspect",
				agentId: e
			};
			s.postMessage(t);
		}
		let C = Br(a, s, {
			ticksPerDay: mo,
			onAgentClicked: S,
			onFollowCancelled: () => {
				f = null, p && v(p);
			},
			onRendererUnavailable: (e) => Fe(r, {
				text: z.cream,
				background: z.ink,
				border: z.rust
			}, e, "hollow-renderer-unavailable")
		}), w = [];
		function T() {
			return new Promise((e) => {
				w.push(e), s.postMessage({ type: "requestLineage" });
			});
		}
		let E = [];
		function D() {
			return new Promise((e) => {
				E.push(e), s.postMessage({ type: "requestInterventions" });
			});
		}
		s.addEventListener("message", (e) => {
			let t = e.data;
			if (t.type === "snapshot") u = t.snapshot;
			else if (t.type === "inspectResult") {
				if (t.agentId !== d) return;
				t.detail ? v(t.detail) : _();
			} else t.type === "events" ? Ui(t.events) : t.type === "metrics" ? Wi(t.row) : t.type === "lineage" ? w.shift()?.(t.entries) : t.type === "interventions" && E.shift()?.(t.log);
		});
		let O = document.createElement("div");
		O.id = "hollow-left-rail";
		let k = ha({
			ticksPerDay: mo,
			onSelectAgent: x
		}), A = Ta(), j = Aa({ requestLineage: T });
		O.appendChild(k.el), O.appendChild(A.el), O.appendChild(j), r.appendChild(O);
		let M = document.createElement("div");
		M.id = "hollow-director-bar";
		let ee = no({
			onSetPaused: (e) => s.postMessage({
				type: "setPaused",
				paused: e
			}),
			onSetSpeed: (e) => s.postMessage({
				type: "setSpeed",
				multiplier: e
			}),
			onStep: () => s.postMessage({ type: "step" })
		}), N = document.createElement("button");
		N.type = "button", N.className = "hollow-share-button", N.textContent = "Share", N.style.color = z.ink, N.style.background = z.cyan, N.addEventListener("click", () => {
			(async () => {
				let e = fo({
					seed: t,
					persona: i,
					interventionLog: await D()
				});
				location.hash = e;
				try {
					await navigator.clipboard.writeText(location.href);
				} catch {}
			})();
		});
		let te = co({ onFireShock: (e) => s.postMessage({
			type: "shock",
			shock: e
		}) }), P = document.createElement("div");
		P.className = "hollow-director-bar-row", P.appendChild(ee.el), n.pageHash && P.appendChild(N), M.appendChild(P), M.appendChild(te), r.appendChild(M);
		let ne = new He(r, { corner: "bottom-right" }), re = !0, F = (e) => {
			e.key === "t" || e.key === "T" ? h = !h : e.key === "j" || e.key === "J" ? g = !g : e.key === "f" || e.key === "F" ? b() : e.key === "`" && (re = !re, ne.setVisible(re));
		};
		r.addEventListener("keydown", F), o();
		let I = hi(r), L = I.getContext("2d");
		L || console.error("[hollow] 2D overlay canvas context unavailable — glyphs/tags will not render.");
		let ie = 0;
		function ae() {
			if (re) {
				let e = C.getRenderReport();
				e && ne.setFrameReport(e), ne.update({
					tick: u?.tick ?? 0,
					alpha: 0,
					entityCount: u?.agents.length ?? 0
				});
			}
			if (L) {
				let e = C.getDpr(), t = a.getBoundingClientRect();
				gi(I, t.width, t.height, e), L.setTransform(e, 0, 0, e, 0, 0);
				let n = C.getAgentRenderState(), r = C.getViewProj();
				if (n && r && u) {
					let e = [];
					for (let t of u.agents) {
						let r = n.get(t.id);
						r && e.push({
							id: t.id,
							headWorld: r.headWorld,
							action: t.action,
							needs: t.needs,
							starving: t.starving,
							occupation: t.occupation
						});
					}
					mi(L, e, {
						viewProj: r,
						width: t.width,
						height: t.height,
						showTags: h,
						showJobs: g,
						selectedAgentId: d
					});
				} else L.clearRect(0, 0, I.width, I.height);
			}
			ie = requestAnimationFrame(ae);
		}
		ie = requestAnimationFrame(ae), c = () => {
			cancelAnimationFrame(ie), r.removeEventListener("keydown", F), C.dispose(), k.dispose(), A.dispose(), ne.destroy(), w.length = 0, E.length = 0;
		};
	}
	let d = n.pageHash ? ho() : null;
	if (d) u({
		seed: d.seed,
		persona: d.persona,
		replayLog: [...d.interventionLog]
	});
	else {
		let e = $a({ onStart: (t) => {
			l || (e.remove(), u({
				seed: t.seed ?? 1708288,
				persona: t
			}));
		} });
		r.appendChild(e);
	}
	return () => {
		l || (l = !0, c?.(), c = null, s.terminate(), r.removeEventListener("pointerdown", o), r.remove(), Xi());
	};
}
//#endregion
//#region src/os-entry.ts
var _o = /* @__PURE__ */ new WeakMap();
function vo(e) {
	yo(e), _o.set(e, go(e, { pageHash: !1 }));
}
function yo(e) {
	_o.get(e)?.(), _o.delete(e);
}
//#endregion
export { vo as mount, yo as unmount };

//# sourceMappingURL=hollow.mjs.map