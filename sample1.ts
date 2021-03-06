function demo() {
  interface Vector3D {
    x: number;
    y: number;
    z: number;
  }

  interface Sphere {
    radius: number;
    center: Vector3D;
    color: Color;
    specular: number;
    refrectance: number;
  }

  type Color = [number, number, number];

  /**
   * 定数。
   */
  var ANIMATION_TIME = 5000; // アニメーション継続時間。(msec)
  var CANVAS_SIZE = 300; // canvasサイズ。("十分大きな値"としても使う)
  var SPHERES_DEF: Sphere[] = [
    // 球体。
    // 半径, [中心],  R, G, B(0..9), 鏡面指数, 反射率(0..9),
    {
      // 黄
      radius: 99,
      center: { x: 0, y: -99, z: 0 },
      color: [9, 9, 0],
      specular: 99,
      refrectance: 1
    },
    {
      // 赤
      radius: 1,
      center: { x: 0, y: 0, z: 3 },
      color: [9, 0, 0],
      specular: 99,
      refrectance: 3
    },
    {
      // 緑
      radius: 1,
      center: { x: -2, y: 1, z: 4 },
      color: [0, 9, 0],
      specular: 9,
      refrectance: 5
    },
    {
      // 青
      radius: 1,
      center: { x: 2, y: 1, z: 4 },
      color: [0, 0, 9],
      specular: 99,
      refrectance: 3
    },
    {
      // 橙
      radius: 1,
      center: { x: 0, y: 2, z: 9 },
      color: [9, 6, 3],
      refrectance: 99,
      specular: 1
    }
  ];
  var AMBIENT_LIGHT = 2; // 環境光。
  var POINT_LIGHTS: Array<{
    intensity: number;
    position: Vector3D;
  }> = [
    {
      intensity: 8, // 強度。(環境光との合計が10になるように)
      position: {
        // 位置。
        x: 2,
        y: 2,
        z: 0,
      }
    }
  ];

  /**
   * メイン。
   */

  // canvas初期化。
  var canvas = document.getElementById("canvas") as HTMLCanvasElement;
  var gCtx = canvas.getContext("2d");
  var gImageData = gCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  var gRawData = gImageData.data;
  canvas.width = canvas.height = CANVAS_SIZE;

  // フレーム描画開始。
  var gTimeLimit = new Date().getTime() + ANIMATION_TIME;
  window.requestAnimationFrame(drawFrame);

  /**
   * フレーム描画。
   */
  function drawFrame(now: number) {
    // 赤玉を動かす。
    SPHERES_DEF[1].center.z = 3 + Math.sin(now / 1000 * (Math.PI * 2) * 0.1);
    SPHERES_DEF[1].center.x = 0 + Math.cos(now / 1000 * (Math.PI * 2) * 0.1);
    POINT_LIGHTS[0].position.z+= 0.3;
    // レンダリング。
    render(now);

    // 次フレームを仕掛ける。
    if (new Date().getTime() < gTimeLimit) {
      window.requestAnimationFrame(drawFrame);
    }
  }

  /**
   * レンダリング。
   */
  function render(now: number) {
    // (y, x)で走査。
    var di = 0;
    var halfSize = CANVAS_SIZE / 2;
    (Array.apply(null, Array(CANVAS_SIZE)) as null[]).forEach((_, i) => {
      const y = halfSize - i;
      (Array.apply(null, Array(CANVAS_SIZE)) as null[]).forEach((_, i) => {
        const x = i - halfSize;
        // カラーチャネルごとに、
        [0, 1, 2].forEach((color: 0 | 1 | 2) => {
          gRawData[di++] = traceRay(
            { x: 0, y: 1, z: 0 }, // カメラ座標
            { x: x / CANVAS_SIZE, y: y / CANVAS_SIZE, z: 1 }, // 光の方向
            1, // tMin (projection planeから)
            CANVAS_SIZE, // tMax (+∞の代わり)
            2, // depth
            color // color channel
          );
        });
        gRawData[di++] = 255; // alpha
      });
    });
    gCtx.putImageData(gImageData, 0, 0);
  }

  /**
   * BからD方向の光線をたどり範囲[tMin~tMax]での交差を調べる。
   * 反射光をdepth回再帰。
   * 当たった点の観測色を返す。
   */
  function traceRay(
    B: Vector3D,
    D: Vector3D,
    tMin: number,
    tMax: number,
    depth: number,
    colorIndex: 0 | 1 | 2,
  ) {
    // 最も近い交点を求める。なければ黒を返す。
    var result = closestIntersection(B, D, tMin, tMax);
    if (result.index == -1) {
      return 0;
    }
    var center = SPHERES_DEF[result.index].center;
    var ip = aMinusBk(B, D, -result.t); // ip: intersection point
    var N = aMinusBk(ip, center, 1); // N: surface normal at intersection

    // Nで正規化する代わりにlengthで割る。
    var n = dot3d(N, N);

    // 環境光に加え、点光源ごとに、
    var light = AMBIENT_LIGHT;
    for (var i = 0; i < POINT_LIGHTS.length; i++) {
      var lightIntensity = POINT_LIGHTS[i].intensity;
      var lightPos = POINT_LIGHTS[i].position;

      // 交点から光源へのベクトルを求める。
      var L = aMinusBk(lightPos, ip, 1);
      var k = dot3d(N, L);

      // 光源の明るさを加算。影に隠れている場合は見えない。
      var M = aMinusBk(L, N, 2 * k / n);
      var shadow = closestIntersection(ip, L, 1 / CANVAS_SIZE, 1).index * -1;
      light +=
        lightIntensity *
        shadow *
        (Math.max(0, k / Math.sqrt(dot3d(L, L) * n)) +
          Math.max(
            0,
            Math.pow(
              dot3d(M, D) / Math.sqrt(dot3d(M, M) * dot3d(D, D)),
              SPHERES_DEF[result.index].specular
            )
          ));
    }

    // color[0~9] * intensity[0~10] * 2.8 -> [0~255]
    var localColor = SPHERES_DEF[result.index].color[colorIndex] * light * 2.8;

    // depthまで再帰する。
    var ref = SPHERES_DEF[result.index].refrectance / 9;
    if (0 < depth) {
      var reTrace = traceRay(
        ip,
        aMinusBk(D, N, 2 * dot3d(N, D) / n),
        1 / CANVAS_SIZE,
        CANVAS_SIZE,
        depth - 1,
        colorIndex
      );
      localColor = reTrace * ref + localColor * (1 - ref);
    }
    return localColor;
  }

  /**
   * BからD方向に最も近い球との交点を探す。
   * [tMin~tMax]は交点の範囲。
   * @return {
   *     index, // 交差する球のindex。無ければ-1。
   *     t      // 交差パラメータ。
   * }
   */
  function closestIntersection(
    B: Vector3D,
    D: Vector3D,
    tMin: number,
    tMax: number
  ) {
    var K1 = dot3d(D, D); // 2次方程式の係数。
    var t = CANVAS_SIZE; // 交点が無い場合。
    var index = -1;

    // 個々の球についてテスト。
    for (var i = 0; i < SPHERES_DEF.length; i++) {
      var radius = SPHERES_DEF[i].radius;
      var center = SPHERES_DEF[i].center;
      var j = aMinusBk(B, center, 1);
      var K2 = -2 * dot3d(j, D); // 2次方程式の係数。
      var K3 = dot3d(j, j) - radius * radius; // 2次方程式の係数。
      var d = Math.sqrt(K2 * K2 - 4 * K1 * K3); // 判別式。
      if (d) {
        // 解があれば、
        for (var e = 0; e < 2; ++e, d = -d) {
          var f = (K2 - d) / (2 * K1); // f: tの候補
          if (tMin < f && f < tMax && f < t) {
            index = i;
            t = f;
          }
        }
      }
    }
    return { index: index, t: t };
  }

  /**
   * ヘルパー: aMinusBk(A, B, k)  =  A - B * k
   */
  function aMinusBk(A: Vector3D, B: Vector3D, k: number): Vector3D {
    return {
      x: A.x - B.x * k,
      y: A.y - B.y * k,
      z: A.z - B.z * k
    };
  }

  /**
   * 3次元のドット積。
   */
  function dot3d(A: Vector3D, B: Vector3D) {
    return A.x * B.x + A.y * B.y + A.z * B.z;
  }
}

demo();
