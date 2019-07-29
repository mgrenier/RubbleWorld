import { Component, Scene, FixedUpdateContext, UpdateContext } from '../Scene';
import { Mutable } from '../util/Mutable';
import { EventEmitter } from 'events';
import { TransformComponent } from './Transform';
import { Vector2 } from '../math/Vector2';
import { ReadonlyBox2 } from '../math/Box2';
import { ReadonlyCircle } from '../math/Circle';
import { lerp, smootherstep } from '../math/util';
import { b2Body, b2BodyDef, b2BodyType } from '@fexel/box2d/Dynamics/b2Body';
import { b2World } from '@fexel/box2d/Dynamics/b2World';
import { b2FixtureDef } from '@fexel/box2d/Dynamics/b2Fixture';
import { b2CircleShape } from '@fexel/box2d/Collision/Shapes/b2CircleShape';
import { b2Shape } from '@fexel/box2d/Collision/Shapes/b2Shape';
import { b2PolygonShape } from '@fexel/box2d/Collision/Shapes/b2PolygonShape';

export class Physics2EngineComponent extends Component {
	public executionOrder = 900;

	public readonly world: b2World;

	constructor() {
		super();

		this.world = new b2World(new Vector2(0, -10));
	}

	didMount() {
		if (!(this.entity instanceof Scene)) {
			this.setEnable(false);
			throw new ReferenceError(`Physics2EngineComponent can only be added to a Scene.`);
		}
	}

	update(context: UpdateContext) {
		if (context.debug) {
			// for (let body = this.world.GetBodyList(); body; body = body.GetNext()) {
			// 	const position = body.GetPosition();
			// 	const asleep = !body.IsAwake;
			// 	const type = body.GetType();
			// 	const color: [number, number, number, number] = asleep
			// 		? [0.3, 0.3, 0.3, 0.5]
			// 		: type === b2BodyType.b2_staticBody
			// 		? [0.6, 0.6, 0.6, 0.5]
			// 		: [1.0, 1.0, 1.0, 0.5];
			// 	for (let fixture = body.GetFixtureList(); fixture; fixture = fixture.GetNext()) {
			// 		const shape = fixture.GetShape();
			// 		if (shape instanceof b2CircleShape) {
			// 		} else if (shape instanceof b2PolygonShape) {
			// 			const vertices = shape.m_vertices;
			// 			const wireframe: number[] = [];
			// 			for (let i = 1, l = vertices.length; i < l; ++i) {
			// 				wireframe.push(vertices[i - 1].x, vertices[i - 1].y, 0, vertices[i].x, vertices[i].y, 0);
			// 			}
			// 			wireframe.push(vertices[vertices.length - 1].x, vertices[vertices.length - 1].y, 0);
			// 			wireframe.push(vertices[0].x, vertices[0].y, 0);
			// 			context.debug.drawPrimitiveLines(wireframe, {
			// 				ttl: 0,
			// 				color,
			// 			});
			// 			const axis: number[] = [
			// 				position.x,
			// 				position.y,
			// 				0,
			// 				(vertices[0].x + vertices[vertices.length - 1].x) / 2,
			// 				(vertices[0].y + vertices[vertices.length - 1].y) / 2,
			// 				0,
			// 			];
			// 			context.debug.drawPrimitiveLines(axis, {
			// 				ttl: 0,
			// 				color: [0.803921568627451, 0.3607843137254902, 0.3607843137254902, 0.5],
			// 			});
			// 		}
			// 	}
			// }
		}
	}

	fixedUpdate(context: FixedUpdateContext) {
		this.world.Step(context.fixedDeltaTime, 8, 3);
	}
}

export enum Physics2BodyType {
	Dynamic,
	Static,
	Kinematic,
}

export class Physics2BodyComponent extends Component {
	public executionOrder = 910;

	public readonly body: b2Body | undefined;

	public readonly transform: TransformComponent | undefined;
	public readonly engine: Physics2EngineComponent | undefined;

	protected emitter = new EventEmitter();

	constructor(public type = Physics2BodyType.Static) {
		super();
	}

	didMount() {
		(this as Mutable<Physics2BodyComponent>).transform = this.getComponent(TransformComponent);
		if (this.transform) {
			this.transform.breakParentChain = true;
		}
		(this as Mutable<Physics2BodyComponent>).engine = this.entity!.scene!.getComponent(Physics2EngineComponent);
		if (this.engine) {
			this.updateBody();
		}
	}

	willUnmount() {
		if (this.engine && this.body) {
			this.engine.world.DestroyBody(this.body);
		}
	}

	updateBody() {
		if (this.engine) {
			const bodyDef = new b2BodyDef();
			switch (this.type) {
				case Physics2BodyType.Dynamic:
					bodyDef.type = b2BodyType.b2_dynamicBody;
					break;
				case Physics2BodyType.Static:
					bodyDef.type = b2BodyType.b2_staticBody;
					break;
				case Physics2BodyType.Kinematic:
					bodyDef.type = b2BodyType.b2_kinematicBody;
					break;
			}

			if (this.transform) {
				bodyDef.position.Set(this.transform.localPosition.x, this.transform.localPosition.y);
				bodyDef.angle = this.transform.localRotation.z;
			}

			if (!this.body) {
				(this as Mutable<Physics2BodyComponent>).body = this.engine!.world.CreateBody(bodyDef);
			} else {
				for (let fixture = this.body.GetFixtureList(); fixture; fixture = fixture.GetNext()) {
					this.body.DestroyFixture(fixture);
				}
				this.body.SetType(bodyDef.type);
				this.body.SetPosition(bodyDef.position);
				this.body.SetAngle(bodyDef.angle);
			}

			const colliders = this.getComponents(Physics2ColliderComponent, true);
			const fixtureDefs = colliders.map(collider => collider.updateFixtureDef());
			for (const fixtureDef of fixtureDefs) {
				this.body!.CreateFixture(fixtureDef);
			}
		}
	}

	update(context: FixedUpdateContext) {
		if (this.body && this.transform) {
			const alpha = smootherstep(
				context.fixedDeltaTime > 0 ? (context.time - context.fixedTime) / context.fixedDeltaTime : 1,
				0,
				1
			);
			const position = this.body.GetPosition();
			const angle = this.body.GetAngle();

			this.transform.localPosition.set(
				lerp(this.transform.localPosition.x, position.x, alpha),
				lerp(this.transform.localPosition.y, position.y, alpha),
				0
			);
			this.transform.localRotation.set(0, 0, lerp(this.transform.localRotation.z, angle, alpha));
		}
	}

	onSleepStart(handler: () => void) {
		return this.emitter.on('onSleepStart', handler);
	}

	onSleepEnd(handler: () => void) {
		return this.emitter.on('onSleepEnd', handler);
	}

	onCollisionStart(handler: (collision: unknown) => void) {
		return this.emitter.on('onCollisionStart', handler);
	}

	onCollisionEnd(handler: (collision: unknown) => void) {
		return this.emitter.on('onCollisionStart', handler);
	}
}

export interface Physics2Filter {
	categoryBits: number;
	maskBits: number;
	groupIndex: number;
}

export abstract class Physics2ColliderComponent extends Component {
	public readonly fixtureDef: b2FixtureDef;

	constructor(
		public shape: b2Shape,
		public density = 0,
		public friction = 0.2,
		public restitution = 0,
		public isSensor = false,
		public filter: Physics2Filter = {
			categoryBits: 0x0001,
			maskBits: 0xffff,
			groupIndex: 0,
		}
	) {
		super();

		this.fixtureDef = new b2FixtureDef();
		this.updateFixtureDef();
	}

	updateFixtureDef() {
		this.fixtureDef.shape = this.shape;
		this.fixtureDef.density = this.density;
		this.fixtureDef.friction = this.friction;
		this.fixtureDef.restitution = this.restitution;
		this.fixtureDef.isSensor = this.isSensor;
		this.fixtureDef.filter.Copy(this.filter);
		return this.fixtureDef;
	}
}

export class Physics2BoxColliderComponent extends Physics2ColliderComponent {
	constructor(
		public readonly size: Vector2,
		public readonly center = Vector2.Zero.clone(),
		public readonly angle = 0,
		density?: number,
		friction?: number,
		restitution?: number,
		isSensor?: boolean,
		filter?: Physics2Filter
	) {
		super(new b2PolygonShape(), density, friction, restitution, isSensor, filter);
		(this.shape as b2PolygonShape).SetAsBox(size.x, size.y, center, angle);
	}
}

export class Physics2CircleColliderComponent extends Physics2ColliderComponent {
	constructor(
		public readonly radius: number,
		density?: number,
		friction?: number,
		restitution?: number,
		isSensor?: boolean,
		filter?: Physics2Filter
	) {
		super(new b2CircleShape(radius), density, friction, restitution, isSensor, filter);
	}
}
