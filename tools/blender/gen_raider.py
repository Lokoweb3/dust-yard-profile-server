"""Generate the Dust Yard raider (hooded desert bandit) and export as FBX.
Usage: blender -b -P gen_raider.py -- <output.fbx>
Character space: feet at z=0, ~1.95m tall, +Y facing (flipped at export for Unity +Z).
Exports three sibling objects matching the Raider prefab children:
  Body (slots RaiderCloth, GunMetal), Head (RaiderCloth, RaiderMask, GunMetal),
  Gun (GunMetal). All origins at character root so prefab children sit at zero.
Prefab colliders/hitboxes are kept in Unity; only meshes swap.
"""
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index("--") + 1]
UV_SCALE = 1.0

bpy.ops.wm.read_factory_settings(use_empty=True)

m_cloth = bpy.data.materials.new("RaiderCloth")
m_mask = bpy.data.materials.new("RaiderMask")
m_metal = bpy.data.materials.new("GunMetal")


def new_obj(name, mats):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    for m in mats:
        obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)
    return obj


def box(bm, uv, mat_i, mn, mx, post=None):
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


def cyl(bm, uv, mat_i, center, radius, length, segments=10):
    m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                                radius1=radius, radius2=radius, depth=length, matrix=m)
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = mat_i
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.y * UV_SCALE, (co.x + co.z) * UV_SCALE)


# ---------------- Body (0 RaiderCloth, 1 GunMetal) ----------------
body = new_obj("Body", [m_cloth, m_metal])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
CLOTH, METAL = 0, 1
# boots (dark)
box(bm, uv, METAL, (-0.16, -0.11, 0.0), (-0.02, 0.16, 0.12))
box(bm, uv, METAL, (0.02, -0.11, 0.0), (0.16, 0.16, 0.12))
# legs with knee wraps
box(bm, uv, CLOTH, (-0.145, -0.09, 0.12), (-0.025, 0.09, 0.88))
box(bm, uv, CLOTH, (0.025, -0.09, 0.12), (0.145, 0.09, 0.88))
for sx in (-1, 1):
    box(bm, uv, CLOTH, (sx * 0.085 - 0.07, -0.105, 0.45), (sx * 0.085 + 0.07, 0.105, 0.56))
# hips + belt (dark) + pouches
box(bm, uv, CLOTH, (-0.17, -0.11, 0.84), (0.17, 0.11, 1.0))
box(bm, uv, METAL, (-0.175, -0.115, 0.95), (0.175, 0.115, 1.0))
box(bm, uv, METAL, (-0.16, 0.10, 0.86), (-0.06, 0.15, 0.95))
box(bm, uv, METAL, (0.06, 0.10, 0.86), (0.16, 0.15, 0.95))
# tattered skirt wrap, flares outward going down
def flare(v):
    if v.co.z < 0.75:
        v.co.x *= 1.3; v.co.y *= 1.35
box(bm, uv, CLOTH, (-0.17, -0.11, 0.6), (0.17, 0.11, 0.86), post=flare)
# torso, hunched forward at the top
def hunch(v):
    if v.co.z > 1.3:
        v.co.y += 0.05
box(bm, uv, CLOTH, (-0.21, -0.12, 1.0), (0.21, 0.14, 1.42), post=hunch)
# chest strap (dark, diagonal suggested by offset thin box)
# NOTE: the export flip negates X, so sides below are authored mirrored —
# the gun arm is built on Blender -X to land on Unity +X where the prefab's Muzzle sits.
box(bm, uv, METAL, (-0.09, 0.135, 1.05), (0.06, 0.155, 1.40))
# shoulder scarf collar
box(bm, uv, CLOTH, (-0.24, -0.16, 1.36), (0.24, 0.18, 1.5))
# shoulder pads
box(bm, uv, CLOTH, (-0.31, -0.11, 1.26), (-0.20, 0.12, 1.44))
box(bm, uv, CLOTH, (0.20, -0.11, 1.26), (0.31, 0.12, 1.44))
# gun arm (Blender -X -> Unity +X) reaching forward to the grip
def r_upper(v):
    if v.co.y > 0.15:
        v.co.z -= 0.1
box(bm, uv, CLOTH, (-0.31, -0.02, 1.2), (-0.21, 0.22, 1.38), post=r_upper)
box(bm, uv, CLOTH, (-0.29, 0.2, 1.14), (-0.21, 0.34, 1.24))
box(bm, uv, METAL, (-0.285, 0.3, 1.13), (-0.22, 0.38, 1.2))   # hand wrap
# support arm crossing to the handguard
def l_upper(v):
    if v.co.y > 0.15:
        v.co.z -= 0.08; v.co.x -= 0.06
box(bm, uv, CLOTH, (0.21, -0.02, 1.2), (0.31, 0.24, 1.38), post=l_upper)
def l_fore(v):
    if v.co.y > 0.4:
        v.co.x -= 0.14
box(bm, uv, CLOTH, (0.15, 0.22, 1.16), (0.25, 0.5, 1.26), post=l_fore)
box(bm, uv, METAL, (-0.225, 0.48, 1.16), (-0.16, 0.56, 1.23))   # support hand on handguard
bm.normal_update(); bm.to_mesh(body.data); bm.free()

# ---------------- Head (0 RaiderCloth, 1 RaiderMask, 2 GunMetal) ----------------
head = new_obj("Head", [m_cloth, m_mask, m_metal])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
HCLOTH, HMASK, HMETAL = 0, 1, 2
# hood: tapers to a point swept back
def hood_peak(v):
    if v.co.z > 1.9:
        v.co.x *= 0.25; v.co.y = v.co.y * 0.4 - 0.12
box(bm, uv, HCLOTH, (-0.15, -0.14, 1.56), (0.15, 0.13, 1.98), post=hood_peak)
# face shadow recess + mask plate
box(bm, uv, HMASK, (-0.095, 0.115, 1.6), (0.095, 0.145, 1.78))
# goggle visor (dark gloss strip)
box(bm, uv, HMETAL, (-0.10, 0.13, 1.70), (0.10, 0.155, 1.76))
# breather box on the mask
box(bm, uv, HMETAL, (-0.045, 0.14, 1.60), (0.045, 0.17, 1.67))
bm.normal_update(); bm.to_mesh(head.data); bm.free()

# ---------------- Gun (0 GunMetal) ----------------
gun = new_obj("Gun", [m_metal])
bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
box(bm, uv, 0, (-0.28, 0.12, 1.20), (-0.22, 0.48, 1.28))        # receiver
box(bm, uv, 0, (-0.265, -0.02, 1.18), (-0.235, 0.12, 1.26))     # stock
box(bm, uv, 0, (-0.265, 0.26, 1.08), (-0.235, 0.32, 1.20))      # mag
box(bm, uv, 0, (-0.265, 0.17, 1.12), (-0.235, 0.23, 1.20))      # grip
cyl(bm, uv, 0, (-0.25, 0.62, 1.245), 0.011, 0.28)               # barrel to y=0.76
bm.normal_update(); bm.to_mesh(gun.data); bm.free()

# ---------------- flip to Unity +Z forward and export ----------------
for o in (body, head, gun):
    for poly in o.data.polygons:
        poly.use_smooth = False
    o.rotation_euler = (0.0, 0.0, math.pi)
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.ops.export_scene.fbx(
    filepath=OUT, use_selection=True,
    apply_scale_options='FBX_SCALE_ALL',
    axis_forward='-Z', axis_up='Y',
    bake_space_transform=True,
    object_types={'MESH'}, add_leaf_bones=False,
)
print("EXPORTED:", OUT)
