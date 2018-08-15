/*Copyright (c) 2013-2016, Rob Schmuecker
 * Slightly improved functionality 2018, KorG
 * vim: cc=79 et sw=3 ts=3 :
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

 * Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

 * Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

 * The name Rob Schmuecker may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/

// User variables
// Paths are not meaningful for server.py due to GET/POST difference
var LOAD_URL = "get.php";
var SAVE_URL = "save.php";

var PARENT_COLOR = "#00ff00";
var NORMAL_COLOR = "#ffffff";
var HIDDEN_COLOR = "#ff0000";

var DEFAULT_WEIGHT = 1000;
var WEIGHT_LENGTH_COMPENSATION = 5;

// Internal variables
var show_hidden = false;
var lock_drag = true;
var maxLabelLength;
var maxVisibleLabelLength;
var maxAnyLabelLength;
var real_root;
var real_update;

function collapse_all_hidden() {
   var collapse_hidden = function(el){
      if (el.children) {
         el.children.forEach(function(d) {
            collapse_hidden(d);
            if (d.hide) {
               el._children.push(d);
               el.children = get_arr_wo_child(el.children, d.id);
            }
         });
      }
   };
   collapse_hidden(real_root);
}

function update_all_nodes(node) {
   if (node.children) {
      node.children.forEach(update_all_nodes);
   }
   if (node._children) {
      node._children.forEach(update_all_nodes);
   }
   real_update(node);
}

function collapse_all_hidden_update() {
   collapse_all_hidden(real_root);
   update_all_nodes(real_root);
}

function toggle_lock_drag() {
   lock_drag = document.getElementById("lock_drag").checked;
}

function toggle_hidden() {
   show_hidden = document.getElementById("show_hidden").checked;
   maxLabelLength = show_hidden ? maxAnyLabelLength : maxVisibleLabelLength;
   maxLabelLength = maxLabelLength + WEIGHT_LENGTH_COMPENSATION;
   collapse_all_hidden();
}

// Get JSON data
treeJSON = d3.json(LOAD_URL, function(error, treeData) {

   // Calculate total nodes, max label length
   var totalNodes = 0;
   maxLabelLength = 0;
   maxVisibleLabelLength = 0;
   maxAnyLabelLength = 0;
   // variables for drag/drop
   var selectedNode = null;
   var draggingNode = null;
   // panning variables
   var panSpeed = 200;
   var panBoundary = 20; // Within 20px from edges will pan when dragging.
   // Misc. variables
   var i = 0;
   var duration = 750;
   var root;

   // size of the diagram
   var viewerWidth = $(document).width() - 2;
   var viewerHeight = $(document).height() - 4;

   var tree = d3.layout.tree()
      .size([viewerHeight, viewerWidth]);

   // define a d3 diagonal projection for use by the node paths later on.
   var diagonal = d3.svg.diagonal()
      .projection(function(d) {
         return [d.y, d.x];
      });

   // A recursive helper function for performing some setup by
   // walking through all nodes

   function visit(parent, visitFn, childrenFn) {
      if (!parent) return;

      visitFn(parent);

      var children = childrenFn(parent);
      if (children) {
         var count = children.length;
         for (var i = 0; i < count; i++) {
            visit(children[i], visitFn, childrenFn);
         }
      }
   }

   // Call visit function to establish maxLabelLength
   visit(treeData, function(d) {
      totalNodes++;
      maxLabelLength = Math.max(d.name.length, maxLabelLength);

   }, function(d) {
      return d.children && d.children.length > 0 ? d.children : null;
   });


   // sort the tree according to the node names

   function sortTree() {
      tree.sort(function(a, b) {
         var a_weight = a.weight ? a.weight : DEFAULT_WEIGHT;
         var b_weight = b.weight ? b.weight : DEFAULT_WEIGHT;
         return b_weight < a_weight ? 1 : -1;
         // return b.name.toLowerCase() < a.name.toLowerCase() ? 1 : -1;
      });
   }
   // Sort the tree initially incase the JSON isn't in a sorted order.
   sortTree();

   // TODO: Pan function, can be better implemented.

   function pan(domNode, direction) {
      var speed = panSpeed;
      if (panTimer) {
         clearTimeout(panTimer);
         translateCoords = d3.transform(svgGroup.attr("transform"));
         if (direction == 'left' || direction == 'right') {
            translateX = direction == 'left' ?
               translateCoords.translate[0] + speed :
               translateCoords.translate[0] - speed;
            translateY = translateCoords.translate[1];
         } else if (direction == 'up' || direction == 'down') {
            translateX = translateCoords.translate[0];
            translateY = direction == 'up' ?
               translateCoords.translate[1] + speed :
               translateCoords.translate[1] - speed;
         }
         scaleX = translateCoords.scale[0];
         scaleY = translateCoords.scale[1];
         scale = zoomListener.scale();
         svgGroup.transition().attr("transform", "translate(" +
            translateX + "," + translateY + ")scale(" + scale + ")");
         d3.select(domNode).select('g.node').attr("transform", "translate(" +
            translateX + "," + translateY + ")");
         zoomListener.scale(zoomListener.scale());
         zoomListener.translate([translateX, translateY]);
         panTimer = setTimeout(function() {
            pan(domNode, speed, direction);
         }, 50);
      }
   }

   // Define the zoom function for the zoomable tree

   function zoom() {
      svgGroup.attr("transform", "translate(" + d3.event.translate +
         ")scale(" + d3.event.scale + ")");
   }


   // define the zoomListener which calls the zoom function on the
   // "zoom" event constrained within the scaleExtents
   var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3])
      .on("zoom", zoom);

   function initiateDrag(d, domNode) {
      draggingNode = d;
      d3.select(domNode).select('.ghostCircle').attr('pointer-events', 'none');
      d3.selectAll('.ghostCircle').attr('class', 'ghostCircle show');
      d3.select(domNode).attr('class', 'node activeDrag');

      svgGroup.selectAll("g.node").sort(function(a, b) {
         // select the parent and sort the path's
         if (a.id != draggingNode.id) return 1;
         // a is not the hovered element, send "a" to the back
         else return -1; // a is the hovered element, bring "a" to the front
      });
      // if nodes has children, remove the links and nodes
      if (nodes.length > 1) {
         // remove link paths
         links = tree.links(nodes);
         nodePaths = svgGroup.selectAll("path.link")
            .data(links, function(d) {
               return d.target.id;
            }).remove();
         // remove child nodes
         nodesExit = svgGroup.selectAll("g.node")
            .data(nodes, function(d) {
               return d.id;
            }).filter(function(d, i) {
               if (d.id == draggingNode.id) {
                  return false;
               }
               return true;
            }).remove();
      }

      // remove parent link
      parentLink = tree.links(tree.nodes(draggingNode.parent));
      svgGroup.selectAll('path.link').filter(function(d, i) {
         if (d.target.id == draggingNode.id) {
            return true;
         }
         return false;
      }).remove();

      dragStarted = null;
   }

   // define the baseSvg, attaching a class for styling and the zoomListener
   var baseSvg = d3.select("#tree-container").append("svg")
      .attr("width", viewerWidth)
      .attr("height", viewerHeight)
      .attr("class", "overlay")
      .call(zoomListener);


   // Define the drag listeners for drag/drop behaviour of nodes.
   dragListener = d3.behavior.drag()
      .on("dragstart", function(d) {
         if (lock_drag || d == root) {
            return;
         }
         dragStarted = true;
         nodes = tree.nodes(d);
         d3.event.sourceEvent.stopPropagation();
         // it's important that we suppress the mouseover event on the
         // node being dragged. Otherwise it will absorb the mouseover event
         // and the underlying node will not detect it d3.select(this).attr(
         // 'pointer-events', 'none');
      })
      .on("drag", function(d) {
         if (lock_drag || d == root) {
            return;
         }
         if (dragStarted) {
            domNode = this;
            initiateDrag(d, domNode);
         }

         // get coords of mouseEvent relative to svg container to allow
         // for panning
         relCoords = d3.mouse($('svg').get(0));
         if (relCoords[0] < panBoundary) {
            panTimer = true;
            pan(this, 'left');
         } else if (relCoords[0] > ($('svg').width() - panBoundary)) {

            panTimer = true;
            pan(this, 'right');
         } else if (relCoords[1] < panBoundary) {
            panTimer = true;
            pan(this, 'up');
         } else if (relCoords[1] > ($('svg').height() - panBoundary)) {
            panTimer = true;
            pan(this, 'down');
         } else {
            try {
               clearTimeout(panTimer);
            } catch (e) {

            }
         }

         d.x0 += d3.event.dy;
         d.y0 += d3.event.dx;
         var node = d3.select(this);
         node.attr("transform", "translate(" + d.y0 + "," + d.x0 + ")");
         updateTempConnector();
      }).on("dragend", function(d) {
         if (lock_drag || d == root) {
            return;
         }
         domNode = this;
         if (selectedNode) {
            // now remove the element from the parent, and insert it into the
            // new elements children
            var index = draggingNode.parent.children.indexOf(draggingNode);
            if (index > -1) {
               draggingNode.parent.children.splice(index, 1);
            }
            if (typeof selectedNode.children !== 'undefined' ||
               typeof selectedNode._children !== 'undefined') {
               if (typeof selectedNode.children !== 'undefined') {
                  selectedNode.children.push(draggingNode);
               } else {
                  selectedNode._children.push(draggingNode);
               }
            } else {
               selectedNode.children = [];
               selectedNode.children.push(draggingNode);
            }
            // Make sure that the node being added to is expanded so user can
            // see added node is correctly moved
            expand(selectedNode);
            sortTree();
            endDrag();
         } else {
            endDrag();
         }
      });

   function endDrag() {
      selectedNode = null;
      d3.selectAll('.ghostCircle').attr('class', 'ghostCircle');
      d3.select(domNode).attr('class', 'node');
      // now restore the mouseover event or we won't be able to drag a 2nd time
      d3.select(domNode).select('.ghostCircle').attr('pointer-events', '');
      updateTempConnector();
      if (draggingNode !== null) {
         update(root);
         centerNode(draggingNode);
         draggingNode = null;
      }
   }

   // Helper functions for collapsing and expanding nodes.

   var overCircle = function(d) {
      selectedNode = d;
      updateTempConnector();
   };
   var outCircle = function(d) {
      selectedNode = null;
      updateTempConnector();
   };

   // Function to update the temporary connector
   // indicating dragging affiliation
   var updateTempConnector = function() {
      var data = [];
      if (draggingNode !== null && selectedNode !== null) {
         // have to flip the source coordinates since we did this for the
         // existing connectors on the original tree
         data = [{
            source: {
               x: selectedNode.y0,
               y: selectedNode.x0
            },
            target: {
               x: draggingNode.y0,
               y: draggingNode.x0
            }
         }];
      }
      var link = svgGroup.selectAll(".templink").data(data);

      link.enter().append("path")
         .attr("class", "templink")
         .attr("d", d3.svg.diagonal())
         .attr('pointer-events', 'none');

      link.attr("d", d3.svg.diagonal());

      link.exit().remove();
   };

   // Function to center node when clicked/dropped so node doesn't get lost
   // when collapsing/moving with large amount of children.

   function centerNode(source) {
      scale = zoomListener.scale();
      x = -source.y0;
      y = -source.x0;
      x = x * scale + viewerWidth / 2;
      y = y * scale + viewerHeight / 2;
      d3.select('g').transition()
         .duration(duration)
         .attr("transform", "translate(" + x + "," + y + ")scale(" +
            scale + ")");
      zoomListener.scale(scale);
      zoomListener.translate([x, y]);
   }

   function centerView() {
      scale = zoomListener.scale();
      x = $(document).width() * 0.1;
      y = viewerHeight / 2;
      d3.select('g').transition()
         .duration(duration)
         .attr("transform", "translate(" + x + "," + y + ")scale(" +
            scale + ")");
      zoomListener.scale(scale);
      zoomListener.translate([x, y]);
   }

   function update_label_length() {
      totalNodes = 0;
      maxLabelLength = 0;

      if (real_root && real_root.name.length > 0) {
         totalNodes = 1;
         maxLabelLength = real_root.name.length;
         
         var total = totalNodes;
         var maxlen = maxLabelLength;
         var maxanylen = maxLabelLength;

         var check_children = function(arr) {
            arr.forEach(function(el){
               total++;
               maxanylen = Math.max(maxanylen, el.name.length);

               if (el.children) {
                  check_children(el.children);
               }

               if (el.hide != true) {
                  maxlen = Math.max(maxlen, el.name.length);
               }
            });
         };
         if (real_root.children) {
            check_children(real_root.children);
         }

         totalNodes = total;

         maxVisibleLabelLength = maxlen;
         maxAnyLabelLength = maxanylen;
         maxLabelLength = show_hidden ? maxanylen : maxlen;
         maxLabelLength = maxLabelLength + WEIGHT_LENGTH_COMPENSATION;

         return;
      }

      visit(treeData, function(d) {
         totalNodes++;
         maxLabelLength = Math.max(d.name.length, maxLabelLength);

         maxAnyLabelLength = maxLabelLength;
         maxVisibleLabelLength = maxLabelLength;

      }, function(d) {
         return d.children && d.children.length > 0 ? d.children : null;
      });

      maxAnyLabelLength = maxAnyLabelLength;
      maxVisibleLabelLength = maxVisibleLabelLength;
      maxLabelLength = show_hidden ? maxAnyLabelLength : maxVisibleLabelLength;
      maxLabelLength = maxLabelLength + WEIGHT_LENGTH_COMPENSATION;
   }

   function click(d) {
      var action = document.getElementById("action_selector").value;
      switch (action) {
         case 'add':
            if (!d.children) {
               d.children = [];
            }

            if ($('#node_name').val().length > 0) {
               var new_node = {};
               new_node.name = $('#node_name').val();

               var new_weight = $('#node_weight').val();
               if (new_weight != null && Number(new_weight) == new_weight) {
                  new_node.weight = Number(new_weight);
               }

               d.children.push( new_node );

               $('#node_name').val('');
               $('#node_weight').val('');
            } else {
               var new_name = window.prompt("New name:", '');
               if (new_name != null && new_name.length > 0) {
                  d.children.push( {name:new_name} );
               }
            }
            update(d);
            break;
         case 'delete':
            var parent_node = d.parent;
            node_delete(d);
            update(parent_node);
            break;
         case 'rename':
            var new_name = window.prompt("New name:", d.name);
            if (new_name != null && new_name.length > 0) {
               d.name = new_name;
            }
            update(d);
            break;
         case 'unhide':
            d.hide = false;
            update(d);
            if (d.parent) {
               update(d.parent);
            }
            break;
         case 'hide':
            if (! d.parent) {
               break;
            }
            d.hide = true;
            if (!d.parent._children) {
               d.parent._children = [];
            }
            d.parent._children.push(d);
            d.parent.children = get_arr_wo_child(d.parent.children, d.id);
            update(d);
            update(d.parent);
            break;
         case 'change_weight':
            var new_weight = window.prompt("New weight:", d.weight);
            if (new_weight != null && Number(new_weight) == new_weight) {
               d.weight = Number(new_weight);
            } else {
               delete d.weight;
            }
            update(d);
            break;
         case 'report':
            report(d);
            break;
         default:
            if (d3.event.defaultPrevented) return; // click suppressed
            d = toggleChildren(d);
            update(d);
            centerNode(d);
            break;
      }

      save_model();
   }

   function update(source) {
      // Compute the new height, function counts total children of root node
      // and sets tree height accordingly.
      // This prevents the layout looking squashed when new nodes are made
      // visible or looking sparse when nodes are removed
      // This makes the layout more consistent.
      var levelWidth = [1];
      update_label_length();

      var childCount = function(level, n) {


         if (n.children && n.children.length > 0) {
            if (levelWidth.length <= level + 1) levelWidth.push(0);

            levelWidth[level + 1] += n.children.length;
            n.children.forEach(function(d) {
               childCount(level + 1, d);
            });
         }
      };
      childCount(0, root);
      var newHeight = d3.max(levelWidth) * 25; // 25 pixels per line  
      tree = tree.size([newHeight, viewerWidth]);

      // Compute the new tree layout.
      var nodes = tree.nodes(root).reverse(),
         links = tree.links(nodes);

      // Set widths between levels based on maxLabelLength.
      nodes.forEach(function(d) {
         d.y = (d.depth * (maxLabelLength * 7)); //maxLabelLength * 10px
         // alternatively to keep a fixed scale one can set a fixed depth per
         // level
         // Normalize for fixed-depth by commenting out below line
         // d.y = (d.depth * 500); //500px per level.
      });

      // Update the nodes…
      node = svgGroup.selectAll("g.node")
         .data(nodes, function(d) {
            return d.id || (d.id = ++i);
         });

      // Enter any new nodes at the parent's previous position.
      var nodeEnter = node.enter().append("g")
         .call(dragListener)
         .attr("class", "node")
         .attr("transform", function(d) {
            return "translate(" + source.y0 + "," + source.x0 + ")";
         })
         .on('click', click);

      nodeEnter.append("circle")
         .attr('class', 'nodeCircle')
         .attr("r", 0)
         .style("fill", function(d) {
            return d._children ? "lightsteelblue" : "#fff";
         });

      nodeEnter.append("text")
         .attr("x", function(d) {
            return 10;
         })
         .attr("dy", ".35em")
         .attr('class', 'nodeText')
         .attr("text-anchor", function(d) {
            return "start"
         })
         .text(function(d) {
            return d.name;
         })
         .style("fill-opacity", 0);

      // phantom node to give us mouseover in a radius around it
      nodeEnter.append("circle")
         .attr('class', 'ghostCircle')
         .attr("r", 30)
         .attr("opacity", 0.2) // change this to zero to hide the target area
         .style("fill", "red")
         .attr('pointer-events', 'mouseover')
         .on("mouseover", function(node) {
            overCircle(node);
         })
         .on("mouseout", function(node) {
            outCircle(node);
         });

      // Update the text to reflect whether node has children or not.
      node.select('text')
         .attr("x", function(d) {
            return 10;
         })
         .attr("text-anchor", function(d) {
            return "start"
         })
         .text(function(d) {
            if (d.weight) {
               return "[" + d.weight + "] " + d.name;
            }
            return d.name;
         });

      // Change the circle fill depending on whether it has children and is
      // collapsed
      node.select("circle.nodeCircle")
         .attr("r", 4.5)
         .style("fill", function(d) {
            if (d._children && d._children.length > 0 &&
               count_visible(d._children) > 0) {
               return PARENT_COLOR;
            } else if (typeof d.hide == "undefined" || d.hide != true) {
               return NORMAL_COLOR;
            } else { //hidden node
               return HIDDEN_COLOR;
            }
         });

      // Transition nodes to their new position.
      var nodeUpdate = node.transition()
         .duration(duration)
         .attr("transform", function(d) {
            return "translate(" + d.y + "," + d.x + ")";
         });

      // Fade the text in
      nodeUpdate.select("text")
         .style("fill-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      var nodeExit = node.exit().transition()
         .duration(duration)
         .attr("transform", function(d) {
            return "translate(" + source.y + "," + source.x + ")";
         })
         .remove();

      nodeExit.select("circle")
         .attr("r", 0);

      nodeExit.select("text")
         .style("fill-opacity", 0);

      // Update the links…
      var link = svgGroup.selectAll("path.link")
         .data(links, function(d) {
            return d.target.id;
         });

      // Enter any new links at the parent's previous position.
      link.enter().insert("path", "g")
         .attr("class", "link")
         .attr("d", function(d) {
            var o = {
               x: source.x0,
               y: source.y0
            };
            return diagonal({
               source: o,
               target: o
            });
         });

      // Transition links to their new position.
      link.transition()
         .duration(duration)
         .attr("d", diagonal);

      // Transition exiting nodes to the parent's new position.
      link.exit().transition()
         .duration(duration)
         .attr("d", function(d) {
            var o = {
               x: source.x,
               y: source.y
            };
            return diagonal({
               source: o,
               target: o
            });
         })
         .remove();

      // Stash the old positions for transition.
      nodes.forEach(function(d) {
         d.x0 = d.x;
         d.y0 = d.y;
      });
   }

   // Append a group which holds all nodes and which the zoom Listener can
   // act upon.
   var svgGroup = baseSvg.append("g");

   // Define the root
   root = treeData;
   root.x0 = viewerHeight / 2;
   root.y0 = 0;

   // Layout the tree initially and center on the root node.
   update(root);
   //centerNode(root);
   centerView();
   real_root = root;
   real_update = update;

});

function copy_node(new_node, old_node) {
   new_node.name = old_node.name;
   if (old_node.hide) { new_node.hide = old_node.hide }

   if (old_node.weight && old_node.weight != 0) {
      new_node.weight = old_node.weight
   }

   if (old_node.children && old_node.children.length > 0) {
      new_node.children = [];
      var i = 0;
      old_node.children.forEach( function(el){
         new_node.children[i] = {};
         copy_node(new_node.children[i++], el)
      });
   }

   if (old_node._children && old_node._children.length > 0) {
      new_node._children = [];
      var i = 0;
      old_node._children.forEach( function(el){
         new_node._children[i] = {};
         copy_node(new_node._children[i++], el)
      });
   }
}

function save_model() {
   var nodes = $.extend(true, [], d3.selectAll('g.node'));
   var model = {};
   var single_root;

   nodes.each(function(){
      var node_data = d3.select(this).datum();
      if (node_data.depth == 0) {
         single_root = node_data;
         real_root = node_data;
      }
   });

   copy_node(model, single_root);
   $('#model').val(JSON.stringify(model));
}

function prepare_metadata(d) {
   if (d.children) {
      d.children.forEach(prepare_metadata)
   }
   if (d._children) {
      d._children.forEach(prepare_metadata)
   }
   delete d.depth;
   delete d.id;
   delete d.parent;
   delete d.x;
   delete d.x0;
   delete d.y;
   delete d.y0;
   delete d.__proto__;
}

function prepare_and_send() {
   save_model();

   var value = $('#model').val();
   var json = JSON.parse(value);

   prepare_metadata(json);

   // Send
   $.ajax({
      type: 'POST', url: SAVE_URL, dataType: 'json',
      data: JSON.stringify(json)
   });

   $('#prepare').val(JSON.stringify(json));
}

function expand(d) {
   if (! d.children) {
      d.children = [];
   }

   if (! d._children) {
      d._children = [];
   }

   d._children.forEach(function(el){
      if (el.hide && show_hidden != true) {
         return;
      }
      d.children.push(el);
      d._children = get_arr_wo_child(d._children, el.id);
   });

   d.children.forEach(expand);
   real_update(d);
}

function get_arr_wo_child(arr, id) {
   var new_children = arr.filter(function(el) {
      return el.id != id;
   });

   return new_children;
}

function count_visible(arr) {
   var count = 0;

   arr.forEach(function(el){
      if (typeof el.hide == "undefined" || el.hide != true){count++}
   });

   return count;
}

function toggleChildren(d) {
   if (d.children) { // move all to _children
      if (! d._children) {
         d._children = [];
      }

      d.children.forEach(function(el){
         d._children.push(el);
      });

      d.children = null;
   } else if (d._children) { // move unhidden from _children
      if (! d.children) {
         d.children = [];
      }

      d._children.forEach(function(el){
         if (el.hide && show_hidden != true) {
            return;
         }
         d.children.push(el);
         d._children = get_arr_wo_child(d._children, el.id);
      });
   }
   return d;
}

function node_delete(d) {
   var parent_node = d.parent;

   if (d.children) {
      d.children.forEach(node_delete);
   }

   if (parent_node) {
      var new_children = parent_node.children.filter(function(el) {
         return el.id != d.id;
      });

      delete parent_node.children;
      parent_node.children = new_children;
   }
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' +
       encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function down() {
   save_model();
   var value = $('#model').val();
   download("map.db", value);
}

function loaded() {
   $("#node_name").val('');
   $("#node_weight").val('');
   $("#model").val('');
   $("#show_hidden").prop('checked', show_hidden);
   $("#lock_drag").prop('checked', lock_drag);

   $("#report-bg").on("click", function(ev) {
      if (ev.target !== this) {
         return;
      }

      $("#report-bg").hide();
   });
}

function report(el) {
   var get_children = function(d, depth) {
      var rc = "\t".repeat(depth) + d.name + "\n";

      if (d.children && d.children.length > 0) {
         d.children.forEach(function(el){
            rc = rc + get_children(el, depth + 1);
         });
      }

      return rc;
   }

   $("#report-txt").val(get_children(el, 0));
   $("#report-bg").show();
}
