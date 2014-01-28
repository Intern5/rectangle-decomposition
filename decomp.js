"use strict"

var bipartiteIndependentSet = require("bipartite-independent-set")
var createIntervalTree = require("interval-tree-1d")
var dup = require("dup")

module.exports = decomposeRegion

function Vertex(point, path, index, concave) {
  this.point = point
  this.path = path
  this.index = index
  this.concave = concave
  this.next = null
  this.prev = null
  this.visited = false
}

function Segment(start, end, direction) {
  var a = start.point[direction^1]
  var b = end.point[direction^1]
  if(a < b) {
    this[0] = a
    this[1] = b
  } else {
    this[0] = b
    this[1] = a
  }
  this.start = start
  this.end = end
  this.direction = direction
  this.number = -1
}

function testSegment(a, b, tree, direction) {
  return !!tree.queryPoint(a.point[direction], function(s) {
    var x = s.start[direction]
    if(a.point[direction] < x && x < b.point[direction]) {
      return true
    }
    return false
  })
}

function getDiagonals(vertices, paths, direction, tree) {
  var concave = []
  for(var i=0; i<vertices.length; ++i) {
    if(vertices[i].concave) {
      concave.push(vertices[i])
    }
  }
  concave.sort(function(a,b) {
    var d = a.point[direction] - b.point[direction]
    if(d) {
      return d
    }
    return a.point[direction^1] - b.point[direction^1]
  })
  var diagonals = []
  for(var i=1; i<concave.length; ++i) {
    var a = concave[i-1]
    var b = concave[i]
    if(a.point[direction] === b.point[direction]) {
      if(a.path === b.path) {
        var n = paths[a.path].length
        var d = (a.index-b.index+n) % n
        if(d === 1 || d === n-1) {
          continue
        }
      }
      if(!testSegment(a, b, tree, direction)) {
        //Check orientation of diagonal
        diagonals.push(new Segment(a, b, direction))
      }
    }
  }
  return diagonals
}

//Find all crossings between diagonals
function findCrossings(hdiagonals, vdiagonals) {
  var htree = createIntervalTree(hdiagonals)
  var crossings = []
  for(var i=0; i<vdiagonals.length; ++i) {
    var v = vdiagonals[i]
    var x = v.start.point[0]
    htree.queryPoint(v.start.point[1], function(h) {
      var x = h.start.point[0]
      if(v[0] <= x && x <= v[1]) {
        crossings.push([h, v])
      }
    })
  }
  return crossings
}

function findSplitters(hdiagonals, vdiagonals) {
  //First find crossings
  var crossings = findCrossings(hdiagonals, vdiagonals)

  /*
  console.log(crossings.map(function(c) {
    return ["{(", c[0].start.point, ")-(", c[0].end.point, ")}-{(",
        c[1].start.point, ")-(", c[1].end.point, ")}"].join("")
  }))
  */

  //Then tag and convert edge format
  for(var i=0; i<hdiagonals.length; ++i) {
    hdiagonals[i].number = i
  }
  for(var i=0; i<vdiagonals.length; ++i) {
    vdiagonals[i].number = i
  }
  var edges = crossings.map(function(c) {
    return [ c[0].number, c[1].number ]
  })

  console.log("crossings = ", edges)

  //Find independent set
  var selected = bipartiteIndependentSet(hdiagonals.length, vdiagonals.length, edges)

  //Convert into result format
  var result = new Array(selected[0].length + selected[1].length)
  var ptr = 0
  for(var i=0; i<selected[0].length; ++i) {
    result[ptr++] = hdiagonals[selected[0][i]]
  }
  for(var i=0; i<selected[1].length; ++i) {
    result[ptr++] = vdiagonals[selected[1][i]]
  }

  //Done
  return result
}

function splitSegment(segment) {
  //Store references
  var a = segment.start
  var b = segment.end
  var pa = a.prev
  var na = a.next
  var pb = b.prev
  var nb = b.next

  //Fix concavity
  a.concave = false
  b.concave = false

  //Compute orientation
  var ao = pa.point[segment.direction] === a.point[segment.direction]
  var bo = pb.point[segment.direction] === b.point[segment.direction]

  if(ao && bo) {
    //Case 1:
    //            ^
    //            |
    //  --->A+++++B<---
    //      |
    //      V
    a.prev = pb
    pb.next = a
    b.prev = pa
    pa.next = b
  } else if(ao && !bo) {
    //Case 2:
    //      ^     |
    //      |     V
    //  --->A+++++B--->
    //            
    //            
    a.prev = b
    b.next = a
    pa.next = nb
    nb.prev = pa
  } else if(!ao && bo) {
    //Case 3:
    //            
    //            
    //  <---A+++++B<---
    //      ^     |
    //      |     V
    a.next = b
    b.prev = a
    na.prev = pb
    pb.next = na

  } else if(!ao && !bo) {
    //Case 3:
    //            |
    //            V
    //  <---A+++++B--->
    //      ^     
    //      |     
    a.next = nb
    nb.prev = a
    b.next = na
    na.prev = b
  }
}

function findLoops(vertices) {
  //Initialize visit flag
  for(var i=0; i<vertices.length; ++i) {
    vertices[i].visited = false
  }
  //Walk over vertex list
  var loops = []
  for(var i=0; i<vertices.length; ++i) {
    var v = vertices[i]
    if(v.visited) {
      continue
    }
    //Walk along loop
    var loop = []
    while(!v.visited) {
      loop.push(v)
      v.visited = true
      v = v.next
    }
    loops.push(loop)
  }
  return loops
}


function splitConcave(vertices) {
  //First step: build segment tree from vertical segments
  var leftsegments = []
  var rightsegments = []
  for(var i=0; i<vertices.length; ++i) {
    var v = vertices[i]
    if(v.next.point[1] === v.point[1]) {
      if(v.next.point[0] < v.point[0]) {
        leftsegments.push(new Segment(v, v.next, 1))
      } else {
        rightsegments.push(new Segment(v, v.next, 1))
      }
    }
  }
  var lefttree = createIntervalTree(leftsegments)
  var righttree = createIntervalTree(rightsegments)
  for(var i=0; i<vertices.length; ++i) {
    var v = vertices[i]
    if(!v.concave) {
      continue
    }

    //Compute orientation
    var y = v.point[1]
    var direction
    if(v.prev.point[0] === v.point[0]) {
      direction = v.prev.point[1] < y
    } else {
      direction = v.next.point[1] < y
    }
    direction = direction ? 1 : -1

    //Scan a horizontal ray
    var closestSegment = null
    var closestDistance = Infinity * direction
    console.log("cast ray->", v.point, [direction, 0])
    if(direction < 0) {
      righttree.queryPoint(v.point[0], function(h) {
        console.log(h.start.point, h.end.point, direction, y)
        var x = h.start.point[1]
        if(x < y && x > closestDistance) {
          closestDistance = x
          closestSegment = h
        }
      })
    } else {
      lefttree.queryPoint(v.point[0], function(h) {
        console.log(h.start.point, h.end.point, direction, y)
        var x = h.start.point[1]
        if(x > y && x < closestDistance) {
          closestDistance = x
          closestSegment = h
        }
      })
    }

    //Create two splitting vertices
    var splitA = new Vertex([v.point[0], closestDistance], 0, 0, false)
    var splitB = new Vertex([v.point[0], closestDistance], 0, 0, false)

    //Clear concavity flag
    v.concave = false

    //Split vertices
    splitA.prev = closestSegment.start
    closestSegment.start.next = splitA
    splitB.next = closestSegment.end
    closestSegment.end.prev = splitB

    //Update segment tree
    var tree
    if(direction < 0) {
      tree = righttree
    } else {
      tree = lefttree
    }
    tree.remove(closestSegment)
    tree.insert(new Segment(closestSegment.start, splitA, 1))
    tree.insert(new Segment(splitB, closestSegment.end, 1))

    //Append vertices
    vertices.push(splitA, splitB)

    console.log("splitting:", closestSegment.start.point, closestSegment.end.point)

    //Cut v, 2 different cases
    if(v.prev.point[0] === v.point[0]) {
      // Case 1
      //             ^
      //             |
      // --->*+++++++X
      //     |       |
      //     V       |
      splitA.next = v
      splitB.prev = v.prev
    } else {
      // Case 2
      //     |       ^
      //     V       |
      // <---*+++++++X
      //             |
      //             |
      splitA.next = v.next
      splitB.prev = v
    }

    //Fix up links
    splitA.next.prev = splitA
    splitB.prev.next = splitB

    console.log("loops = ", findLoops(vertices).map(function(l) {
      return l.map(function(v) {
        return v.point
      })
    }))
  }
}

function findRegions(vertices) {
  var n = vertices.length
  for(var i=0; i<n; ++i) {
    vertices[i].visited = false
  }
  //Walk over vertex list
  var rectangles = []
  for(var i=0; i<n; ++i) {
    var v = vertices[i]
    if(v.visited) {
      continue
    }
    //Walk along loop
    var lo = [ Infinity, Infinity ]
    var hi = [-Infinity,-Infinity ]
    while(!v.visited) {
      for(var j=0; j<2; ++j) {
        lo[j] = Math.min(v.point[j], lo[j])
        hi[j] = Math.max(v.point[j], hi[j])
      }
      v.visited = true
      v = v.next
    }
    rectangles.push([lo, hi])
  }
  return rectangles
}


function decomposeRegion(paths, clockwise) {
  if(!Array.isArray(paths)) {
    throw new Error("rectangle-decomposition: Must specify list of loops")
  }

  //Coerce to boolean type
  clockwise = !!clockwise

  //First step: unpack all vertices into internal format
  var vertices = []
  var ptr = 0
  var npaths = new Array(paths.length)
  for(var i=0; i<paths.length; ++i) {
    var path = paths[i]
    if(!Array.isArray(path)) {
      throw new Error("rectangle-decomposition: Loop must be array type")
    }
    var n = path.length
    var prev = path[n-3]
    var cur = path[n-2]
    var next = path[n-1]
    npaths[i] = []
    console.log("loop:")
    for(var j=0; j<n; ++j) {
      prev = cur
      cur = next
      next = path[j]
      if(!Array.isArray(next) || next.length !== 2) {
        throw new Error("rectangle-decomposition: Must specify list of loops")
      }
      var concave = false
      if(prev[0] === cur[0]) {
        if(next[0] === cur[0]) {
          continue
        }
        var dir0 = prev[1] < cur[1]
        var dir1 = cur[0] < next[0]
        concave = dir0 === dir1
      } else {
        if(next[1] === cur[1]) {
          continue
        }
        var dir0 = prev[0] < cur[0]
        var dir1 = cur[1] < next[1]
        concave = dir0 !== dir1
      }
      if(clockwise) {
        concave = !concave
      }
      var vtx = new Vertex(
        cur,
        i,
        (j + n - 1)%n,
        concave)
      npaths[i].push(vtx)
      vertices.push(vtx)
      console.log(vtx.point, vtx.concave)
    }
  }

  //Next build interval trees for segments, link vertices into a list
  var hsegments = []
  var vsegments = []
  for(var i=0; i<npaths.length; ++i) {
    var p = npaths[i]
    for(var j=0; j<p.length; ++j) {
      var a = p[j]
      var b = p[(j+1)%p.length]
      if(a.point[0] === b.point[0]) {
        hsegments.push(new Segment(a,b,0))
      } else {
        vsegments.push(new Segment(a,b,1))
      }
      if(clockwise) {
        a.prev = b
        b.next = a
      } else {
        a.next = b
        b.prev = a
      }
    }
  }
  var htree = createIntervalTree(hsegments)
  var vtree = createIntervalTree(vsegments)

  console.log("hsegments=", hsegments.map(function(h) {
    return ["(", h.start.point, ")-(", h.end.point, ")"].join("")
  }))
  console.log("vsegments=", vsegments.map(function(h) {
    return ["(", h.start.point, ")-(", h.end.point, ")"].join("")
  }))

  //Find horizontal and vertical diagonals
  var hdiagonals = getDiagonals(vertices, npaths, 0, vtree)
  console.log("hdiagonals = ", hdiagonals.map(function(h) {
    return ["(", h.start.point, ")-(", h.end.point, ")"].join("")
  }))
  
  var vdiagonals = getDiagonals(vertices, npaths, 1, htree)
  console.log("vdiagonals = ", vdiagonals.map(function(h) {
    return ["(", h.start.point, ")-(", h.end.point, ")"].join("")
  }))

  //Find all splitting edges
  var splitters = findSplitters(hdiagonals, vdiagonals)

  console.log("splitters = ", splitters.map(function(s) {
    return ["(", s.start.point.join(), ")-(", s.end.point.join(), ")"].join("")
  }))
  
  //Cut all the splitting diagonals
  for(var i=0; i<splitters.length; ++i) {
    console.log("loops = ", findLoops(vertices).map(function(l) {
      return l.map(function(v) {
        return v.point
      })
    }))
    splitSegment(splitters[i])
    console.log("splitting ", splitters[i].start.point, splitters[i].end.point)
  }

  console.log("loops = ", findLoops(vertices).map(function(l) {
      return l.map(function(v) {
        return v.point
      })
    }))

  //Split all concave vertices
  splitConcave(vertices)

  //Cut out loops
  console.log("final loops = ", findLoops(vertices).map(function(l) {
      return l.map(function(v) {
        return v.point
      })
    }))

  //Return regions
  return findRegions(vertices)
}