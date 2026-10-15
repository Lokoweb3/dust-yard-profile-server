"""Generate the KR-7 carbine and export as FBX for Unity.
Usage: blender -b -P gen_rifle.py -- <output.fbx>
Blender axes: +Y = barrel forward, +Z = up, X = right. Bore line at z=0.045.
Exports four sibling objects: Body, Mag (origin at top for reload anim),
Sight (origin at optical center for ADS), Muzzle (origin at tip for effects).
Material slots: GunMetal, GunTan, RedDot - remapped to project materials in Unity.
"""
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index("--") + 1]
UV_SCALE = 2.0

bpy.ops.wm.read_factory_settings(use_empty=True)

mat_metal = bpy.data.materials.new("GunMetal")
mat_tan = bpy.data.materials.new("GunTan")
mat_dot = bpy.data.materials.new("RedDot")


def new_obj(name, origin, mats):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(origin)
    for m in mats:
        obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)
    return obj


def box(bm, uv, mat_i, mn, mx, post=None):
    """Axis-aligned box [mn..mx] with box-projected UVs; post(v) can reshape verts."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res["verts"]
    c = (Vector(mn) + Vector(mx)) * 0.5
    s = Vector(mx) - Vector(mn)
    for v in vs:
        v.co = Vector((v.co.x * s.x, v.co.y * s.y, v.co.z * s.z)) + c
        if post:
            post(v)
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        f.material_index = mat_i
        f.normal_update()
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            p = (co.y, co.z) if abs(n.x) > 0.5 else (co.x, co.z) if abs(n.y) > 0.5 else (co.x, co.y)
            loop[uv].uv = (p[0] * UV_SCALE, p[1] * UV_SCALE)
    return vs


def cyl(bm, uv, mat_i, center, radius, length, segments=12):
    """Cylinder along +Y centered at center."""
    m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                                radius1=radius, radius2=radius, depth=length, matrix=m)
    faces = {f for v in res["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = mat_i
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.y * UV_SCALE, (co.x + co.z) * UV_SCALE)


# ---------------- Body (slots: 0 GunMetal, 1 GunTan) ----------------
body = new_obj("Body", (0, 0, 0), [mat_metal, mat_tan])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
METAL, TAN = 0, 1
# receiver
box(bm, uv, METAL, (-0.022, -0.03, 0.0), (0.022, 0.22, 0.075))
# ejection port hint (shallow dark plate on right side)
box(bm, uv, METAL, (0.0222, 0.05, 0.03), (0.0235, 0.12, 0.06))
# top rail with fins
box(bm, uv, METAL, (-0.016, -0.02, 0.075), (0.016, 0.21, 0.081))
for i in range(9):
    y0 = 0.0 + i * 0.023
    box(bm, uv, METAL, (-0.017, y0, 0.081), (0.017, y0 + 0.012, 0.0875))
# handguard (tan) with dark vent inserts
box(bm, uv, TAN, (-0.026, 0.22, 0.01), (0.026, 0.46, 0.08))
for i in range(3):
    y0 = 0.255 + i * 0.065
    for sx in (-1, 1):
        box(bm, uv, METAL, (sx * 0.0225, y0, 0.03), (sx * 0.0265, y0 + 0.04, 0.052))
    box(bm, uv, METAL, (-0.018, y0, 0.0), (0.018, y0 + 0.04, 0.012))
# barrel
cyl(bm, uv, METAL, (0, 0.5125, 0.045), 0.009, 0.105)
# gas block hint
box(bm, uv, METAL, (-0.012, 0.44, 0.03), (0.012, 0.465, 0.07))
# stock: buffer tube, body (angled underside), butt pad (tan body, metal pad)
box(bm, uv, METAL, (-0.014, -0.14, 0.025), (0.014, -0.03, 0.06))
def stock_shear(v):
    if v.co.z < 0.0 and v.co.y > -0.15:   # bottom-front corner rises -> angled underside
        v.co.z = 0.03
box(bm, uv, TAN, (-0.017, -0.31, -0.005), (0.017, -0.14, 0.075), post=stock_shear)
box(bm, uv, METAL, (-0.019, -0.325, -0.02), (0.019, -0.31, 0.078))
# cheek riser
box(bm, uv, TAN, (-0.015, -0.27, 0.075), (0.015, -0.17, 0.088))
# grip (tan, raked back at the bottom)
def grip_shear(v):
    if v.co.z < -0.04:
        v.co.y -= 0.032
box(bm, uv, TAN, (-0.013, 0.0, -0.095), (0.013, 0.045, 0.005), post=grip_shear)
# trigger guard plate
box(bm, uv, METAL, (-0.011, 0.03, -0.022), (0.011, 0.095, -0.016))
bm.normal_update(); bm.to_mesh(body.data); bm.free()

# ---------------- Mag (origin at top center, for the reload drop) ----------------
magp = Vector((0, 0.085, 0.0))
mag = new_obj("Mag", magp, [mat_metal])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
box(bm, uv, 0, (-0.015, -0.022, -0.075), (0.015, 0.022, 0.0))
def mag_curve(v):
    if v.co.z < -0.074:
        v.co.y += 0.028 * ((-0.074 - v.co.z) / 0.066)
box(bm, uv, 0, (-0.015, -0.022, -0.14), (0.015, 0.022, -0.074), post=mag_curve)
# base plate
box(bm, uv, 0, (-0.017, -0.024 + 0.028, -0.148), (0.017, 0.024 + 0.028, -0.138))
bm.normal_update(); bm.to_mesh(mag.data); bm.free()

# ---------------- Sight (origin at optical center, for ADS) ----------------
sightp = Vector((0, 0.05, 0.112))
sight = new_obj("Sight", sightp, [mat_metal, mat_dot])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
# ring housing: torus approximated by bridged 16-gon rings
def ring_pts(r, y):
    return [Vector((r * math.cos(a), y, r * math.sin(a))) for a in
            [i / 16 * 2 * math.pi for i in range(16)]]
outer_f, outer_b = ring_pts(0.017, 0.008), ring_pts(0.017, -0.008)
inner_f, inner_b = ring_pts(0.0125, 0.008), ring_pts(0.0125, -0.008)
vof = [bm.verts.new(p) for p in outer_f]; vob = [bm.verts.new(p) for p in outer_b]
vif = [bm.verts.new(p) for p in inner_f]; vib = [bm.verts.new(p) for p in inner_b]
for i in range(16):
    j = (i + 1) % 16
    for quad in ((vof[i], vof[j], vob[j], vob[i]),      # outer wall
                 (vib[i], vib[j], vif[j], vif[i]),      # inner wall
                 (vif[i], vif[j], vof[j], vof[i]),      # front face
                 (vob[i], vob[j], vib[j], vib[i])):     # back face
        f = bm.faces.new(quad)
        f.material_index = 0
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x * UV_SCALE, loop.vert.co.z * UV_SCALE)
# the dot: small disc at the optical center
cyl(bm, uv, 1, (0, -0.002, 0), 0.0035, 0.004, segments=10)
# base post down to the rail (rail top world z=0.0875 -> rel z=-0.0245)
box(bm, uv, 0, (-0.007, -0.014, -0.0285), (0.007, 0.014, -0.015))
bm.normal_update(); bm.to_mesh(sight.data); bm.free()

# ---------------- Muzzle (origin at tip, for flash/tracer/shell effects) ----------------
muzp = Vector((0, 0.615, 0.045))
muz = new_obj("Muzzle", muzp, [mat_metal])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
cyl(bm, uv, 0, (0, -0.025, 0), 0.0135, 0.05, segments=10)
for sx in (-1, 1):   # brake slots
    box(bm, uv, 0, (sx * 0.0115, -0.035, -0.004), (sx * 0.0155, -0.015, 0.004))
bm.normal_update(); bm.to_mesh(muz.data); bm.free()

# ---------------- export ----------------
# Blender +Y exports to Unity -Z with these axis settings, so flip 180 about Z
# to get the barrel pointing down Unity +Z.
for poly_obj in (body, mag, sight, muz):
    for poly in poly_obj.data.polygons:
        poly.use_smooth = False
    poly_obj.rotation_euler = (0.0, 0.0, math.pi)
    l = poly_obj.location
    poly_obj.location = Vector((-l.x, -l.y, l.z))
    poly_obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.fbx(
    filepath=OUT, use_selection=True,
    apply_scale_options='FBX_SCALE_ALL',
    axis_forward='-Z', axis_up='Y',
    bake_space_transform=True,
    object_types={'MESH'}, add_leaf_bones=False,
)
print("EXPORTED:", OUT)
