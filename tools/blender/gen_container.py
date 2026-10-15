"""Generate a corrugated 20ft-style shipping container and export as FBX.
Usage: blender -b -P gen_container.py -- <output.fbx>
Dimensions: 6.0 L x 2.44 W x 2.59 H (meters), origin at bottom center.
Blender axes: X = length, Y = width, Z = up. FBX export converts to Unity Y-up.
"""
import bpy, bmesh, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]

L, W, H = 6.0, 2.44, 2.59
CORR_PERIOD = 0.28       # corrugation period (m)
CORR_DEPTH = 0.04        # ridge depth (m)
FRAME = 0.12             # corner post thickness
UV_SCALE = 0.5           # 1 texture tile per 2 m

bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new("Container")
obj = bpy.data.objects.new("Container20ft", mesh)
bpy.context.collection.objects.link(obj)
bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")


def corrugated_strip(length, height, origin, dir_len, dir_out, periods=None):
    """Vertical-ridge corrugated panel. dir_len: along length, dir_out: outward normal.
    Trapezoid wave: per period 4 columns at offsets 0, d, d, 0."""
    n_per = max(1, round(length / CORR_PERIOD))
    cols = n_per * 4
    offs = [0.0, CORR_DEPTH, CORR_DEPTH, 0.0]
    verts_bot, verts_top = [], []
    for i in range(cols + 1):
        x = length * i / cols
        o = offs[i % 4]
        base = origin + dir_len * x + dir_out * (-o)  # ridges recessed inward
        verts_bot.append(bm.verts.new(base))
        verts_top.append(bm.verts.new(base + Vector((0, 0, height))))
    for i in range(cols):
        f = bm.faces.new((verts_bot[i], verts_bot[i + 1], verts_top[i + 1], verts_top[i]))
        f.normal_update()
        for loop in f.loops:
            co = loop.vert.co
            u = (co - origin).dot(dir_len) * UV_SCALE
            v = co.z * UV_SCALE
            loop[uv_layer].uv = (u, v)


def box(center, size):
    """Axis-aligned box with box-projected UVs."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res["verts"]
    for vtx in vs:
        vtx.co = Vector((vtx.co.x * size[0], vtx.co.y * size[1], vtx.co.z * size[2])) + Vector(center)
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        f.normal_update()
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            if abs(n.x) > 0.5:
                uv = (co.y, co.z)
            elif abs(n.y) > 0.5:
                uv = (co.x, co.z)
            else:
                uv = (co.x, co.y)
            loop[uv_layer].uv = (uv[0] * UV_SCALE, uv[1] * UV_SCALE)


hw = W / 2
# --- corrugated long sides (recessed between corner posts)
side_len = L - 2 * FRAME
corrugated_strip(side_len, H - 2 * FRAME, Vector((-L / 2 + FRAME, -hw + CORR_DEPTH, FRAME)),
                 Vector((1, 0, 0)), Vector((0, -1, 0)))
corrugated_strip(side_len, H - 2 * FRAME, Vector((L / 2 - FRAME, hw - CORR_DEPTH, FRAME)),
                 Vector((-1, 0, 0)), Vector((0, 1, 0)))
# --- corrugated closed end (at -X)
end_len = W - 2 * FRAME
corrugated_strip(end_len, H - 2 * FRAME, Vector((-L / 2 + CORR_DEPTH, hw - FRAME, FRAME)),
                 Vector((0, -1, 0)), Vector((-1, 0, 0)))
# --- door end (at +X): two flat leaves, slightly inset
leaf_w = (W - 2 * FRAME) / 2 - 0.01
for s in (-1, 1):
    box((L / 2 - 0.05, s * (leaf_w / 2 + 0.01), H / 2), (0.05, leaf_w, H - 2 * FRAME))
    # lock rods: two per leaf
    for r in (0.3, 0.7):
        box((L / 2 + 0.02, s * (leaf_w * r + 0.02), H / 2), (0.035, 0.035, H - 2 * FRAME - 0.1))
# --- roof (shallow corrugation) & floor
corrugated_strip(side_len, 0.0001, Vector((-L / 2 + FRAME, 0, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)))  # placeholder removed below
# simpler: flat roof + floor slabs
box((0, 0, H - FRAME / 2), (L, W, FRAME))
box((0, 0, FRAME / 2), (L, W, FRAME))
# --- frame: 4 corner posts + horizontal rails
for sx in (-1, 1):
    for sy in (-1, 1):
        box((sx * (L / 2 - FRAME / 2), sy * (hw - FRAME / 2), H / 2), (FRAME, FRAME, H))
for sz in (FRAME / 2, H - FRAME / 2):
    for sy in (-1, 1):
        box((0, sy * (hw - FRAME / 2), sz), (L, FRAME, FRAME))
    for sx in (-1, 1):
        box((sx * (L / 2 - FRAME / 2), 0, sz), (FRAME, W, FRAME))

# drop degenerate faces from the placeholder strip (zero height)
for f in [f for f in bm.faces if f.calc_area() < 1e-6]:
    bm.faces.remove(f)
for v in [v for v in bm.verts if not v.link_faces]:
    bm.verts.remove(v)

bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.normal_update()
bm.to_mesh(mesh)
bm.free()

for poly in mesh.polygons:
    poly.use_smooth = False

bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.export_scene.fbx(
    filepath=OUT, use_selection=True,
    apply_scale_options='FBX_SCALE_ALL',
    axis_forward='-Z', axis_up='Y',
    bake_space_transform=True,
    object_types={'MESH'}, add_leaf_bones=False,
)
print("EXPORTED:", OUT)
