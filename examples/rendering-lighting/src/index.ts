import { RenderableEngine } from '@fexel/core/Engine';
import { Stats } from '@fexel/core/Stats';
import { Material } from '@fexel/core/rendering/Material';
import { Vector3 } from '@fexel/core/math/Vector3';
import { Mesh } from '@fexel/core/rendering/Mesh';
import { Texture, TextureFormat, TextureType } from '@fexel/core/rendering/Texture';
import { Scene, Entity, Component } from '@fexel/core/Scene';
import { MeshRendererComponent } from '@fexel/core/components/MeshRenderer';
import {
	CameraPerspectivePrefab,
	CameraPerspectiveComponent,
	CameraComponent,
	CameraOrthographicPrefab,
} from '@fexel/core/components/Camera';
import { TransformComponent } from '@fexel/core/components/Transform';
import { VertexShader, FragmentShader } from '@fexel/core/rendering/Shader';
import { Color } from '@fexel/core/math/Color';
import { Euler } from '@fexel/core/math/Euler';
import { DEG2RAD } from '@fexel/core/math/util';
import { RenderTarget, RenderTargetAttachment } from '@fexel/core/rendering/RenderTarget';
import { UnlitSampledMaterial } from '@fexel/core/materials/UnlitSampled';
import { PlaneGeometry } from '@fexel/core/geometries/Plane';
import { BoxGeometry } from '@fexel/core/geometries/Box';
import { SphereGeometry } from '@fexel/core/geometries/Sphere';
import { Vector2 } from '@fexel/core/math/Vector2';
import { LightComponent, DirectionalLightComponent } from '@fexel/core/components/Light';

const stats = new Stats();
stats.graphCanvas.style.opacity = '0.9';
document.body.appendChild(stats.graphCanvas);
document.body.appendChild(stats.labelCanvas);
setInterval(() => stats.update(), 1000 / 30);

const canvasEl = document.getElementById('canvas')! as HTMLCanvasElement;
const engine = ((window as any).engine = new RenderableEngine(canvasEl, stats));

const uvDebugTex = new Texture({ data: document.getElementById('uvdebug')! as HTMLImageElement });
const uvDebugMat = new UnlitSampledMaterial();
uvDebugMat.uniforms.Texture0 = uvDebugTex;

const shadeMat = new Material(
	new VertexShader(`
		precision mediump int;
		precision highp float;
		const int maxLightCount = 4;
		struct light {
			int type;
			vec3 position;
			vec3 direction;
			float intensity;
			vec3 color;
			mat4 shadowtransform;
		};
		attribute vec3 Position0;
		attribute vec3 Normal0;
		attribute vec2 UV0;
		uniform mat4 ProjectionMatrix;
		uniform mat4 WorldMatrix;
		uniform mat4 ModelMatrix;
		uniform int LightCount;
		uniform light Lights[maxLightCount];
		uniform sampler2D ShadowTextures[maxLightCount];
		varying vec3 v_Normal;
		varying vec2 v_UV;
		varying vec4 v_ShadowPosition[maxLightCount];

		const mat4 texUnitConverter = mat4(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);

		void main(void) {
			for (int i = 0; i < maxLightCount; ++i) {
				if (i < LightCount) {
					// v_ShadowPosition[i] = texUnitConverter * Lights[i].shadowtransform * ModelMatrix * vec4(Position0, 1.0);
					v_ShadowPosition[i] = Lights[i].shadowtransform * ModelMatrix * vec4(Position0, 1.0);
				}
			}

			v_UV = UV0;
			v_Normal = mat3(WorldMatrix) * mat3(ModelMatrix) * Normal0;
			gl_Position = ProjectionMatrix * WorldMatrix * ModelMatrix * vec4(Position0, 1.0);
		}
	`),
	new FragmentShader(`
		precision mediump int;
		precision highp float;
		const int maxLightCount = 4;
		struct light {
			int type;
			vec3 position;
			vec3 direction;
			float intensity;
			vec3 color;
			mat4 shadowtransform;
		};
		uniform int LightCount;
		uniform light Lights[maxLightCount];
		uniform sampler2D ShadowTextures[maxLightCount];
		uniform vec3 Ambient;
		uniform sampler2D Texture0;
		varying vec3 v_Normal;
		varying vec2 v_UV;
		varying vec4 v_ShadowPosition[maxLightCount];

		void main(void) {
			// vec4 color = texture2D(Texture0, v_UV);
			// gl_FragColor = vec4(color.xyz, 1.0);

			// gl_FragColor = vec4(v_ShadowPosition[0].xy, 0.0, 1.0);

			vec3 shadowUV = v_ShadowPosition[0].xyz / v_ShadowPosition[0].w;
			shadowUV = shadowUV * 0.5 + 0.5;
			float depth = texture2D(ShadowTextures[0], shadowUV.xy).r;

			// gl_FragColor = vec4(shadowUV.xy, 0.0, 1.0);
			// gl_FragColor = vec4(shadowUV.z, 0.0, 0.0, 1.0); // Z WORKS !
			gl_FragColor = vec4(shadowUV.xyz, 1.0);

			// if (v_ShadowPosition[0].z <= -13.0) {
			// 	gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
			// } else {
			// 	gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
			// }

			// if (shadowUV.z <= -6.0) {
			// 	gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
			// } else {
			// 	gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
			// }
		}
	`)
);
shadeMat.uniforms.Texture0 = uvDebugTex;

class MoverComponent extends Component {
	public transform: TransformComponent | undefined;
	constructor(public offset = new Vector3()) {
		super();
	}
	didMount() {
		this.transform = this.getComponent(TransformComponent);
	}
	update({ time }) {
		if (this.transform) {
			this.transform.localPosition.set(
				this.offset.x + Math.sin(Math.max(0, time) / 500) * 2,
				this.offset.y + Math.cos(Math.max(0, time) / 500) * 2,
				this.offset.z
			);
			// this.transform.localRotation.set(
			// 	this.transform.localRotation.x + 1 * DEG2RAD,
			// 	this.transform.localRotation.y + 1 * DEG2RAD,
			// 	this.transform.localRotation.z + 1 * DEG2RAD
			// );
		}
	}
}

const mainCam = CameraPerspectivePrefab({
	position: new Vector3(0, -3, -30),
	rotation: new Euler(-70 * DEG2RAD, 0, 0),
	camera: {
		fov: 40,
		near: 0.01,
		far: 100,
		zoom: 1,
	},
});
mainCam.getComponent(CameraComponent)!.viewport.setFromCenterAndSize(new Vector2(0.25, 0.5), new Vector2(0.5, 1.0));
mainCam.getComponent(CameraComponent)!.backgroundColor = Color.White;
mainCam.getComponent(CameraComponent)!.showDebug = true;
mainCam.getComponent(CameraComponent)!.visibilityFlag ^= 2;

const plane = new PlaneGeometry(10, 10);
const planeMesh = new Mesh(plane.meshData);
const planeEnt = new Entity('Plane', [new TransformComponent(), new MeshRendererComponent(planeMesh, shadeMat)]);

const box = new BoxGeometry(2, 2, 2);
const boxMesh = new Mesh(box.meshData);
const boxEnt = new Entity('Box', [
	new TransformComponent(new Vector3(), new Euler(0, 45 * DEG2RAD, 45 * DEG2RAD)),
	new MeshRendererComponent(boxMesh, shadeMat),
	new MoverComponent(new Vector3(-1, 1, 2)),
]);

const sphere = new SphereGeometry(1);
const sphereMesh = new Mesh(sphere.meshData);
const sphereEnt = new Entity('Sphere', [
	new TransformComponent(),
	new MeshRendererComponent(sphereMesh, shadeMat),
	new MoverComponent(new Vector3(1.5, 1, 2)),
]);

const shadowTex = new Texture({
	width: 512,
	height: 512,
	internalFormat: TextureFormat.DEPTH_COMPONENT,
	format: TextureFormat.DEPTH_COMPONENT,
	type: TextureType.UNSIGNED_SHORT,
});

const topLight = new Entity('Light', [
	new TransformComponent(new Vector3(0, 0, -10)),
	new DirectionalLightComponent(
		{
			intensity: 1.0,
			color: new Color().fromRGBA(231, 210, 179),
			shadowMap: shadowTex,
		},
		0,
		12
	),
]);
topLight.getComponent(LightComponent)!.visibilityFlag ^= 2;

const topCam = CameraOrthographicPrefab({
	position: new Vector3(0, 0, -10),
	camera: {
		left: -5,
		right: 5,
		top: 5,
		bottom: -5,
		near: 0,
		far: 10.5,
		zoom: 1,
	},
});
topCam.getComponent(CameraComponent)!.viewport.setFromCenterAndSize(new Vector2(0.75, 0.75), new Vector2(0.5, 0.5));
topCam.getComponent(CameraComponent)!.visibilityFlag ^= 2;

const debugCam = CameraOrthographicPrefab({
	camera: {
		left: -5,
		right: 5,
		top: 5,
		bottom: -5,
		near: -5,
		far: 20,
		zoom: 1,
	},
});
debugCam.getComponent(CameraComponent)!.viewport.setFromCenterAndSize(new Vector2(0.75, 0.25), new Vector2(0.5, 0.5));
debugCam.getComponent(CameraComponent)!.visibilityFlag = 2;

const debugGeo = new PlaneGeometry(10, 10);
const debugMat = new UnlitSampledMaterial();
debugMat.uniforms.Texture0 = shadowTex;
const debugPlane = new Entity('RT', [
	new TransformComponent(new Vector3()),
	new MeshRendererComponent(new Mesh(debugGeo.meshData), debugMat),
]);
debugPlane.getComponent(MeshRendererComponent)!.visibilityFlag = 2;

const scene = new Scene().addChild(mainCam, planeEnt, boxEnt, sphereEnt, topLight, topCam, debugCam, debugPlane);
engine.loadScene(scene);
engine.start();