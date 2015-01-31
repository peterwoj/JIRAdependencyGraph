// ==UserScript==
// @name         JIRAdepenedencyGrpah
// @namespace    https://github.com/davehamptonusa/JIRAdependencyGraph
// @updateURL    https://raw.githubusercontent.com/davehamptonusa/JIRAdependencyGraph/master/dependencyGraph.user.js
// @version      1.2.0
// @description  This is currently designed just for Conversant
// @author       davehamptonusa
// @match        http://jira.cnvrmedia.net/browse/MTMS-*
// @match        http://10.110.101.95/browse/MTMS-*
// @match        http://jira.cnvrmedia.net/browse/COR-*
// @match        http://10.110.101.95/browse/COR-*
// @match        http://jira.cnvrmedia.net/browse/HDP-*
// @match        http://10.110.101.95/browse/HDP-*
// @grant        GM_addStyle
// @require	  	 http://code.jquery.com/jquery-latest.js
// @require      http://cdn.mplxtms.com/s/v/underscore-1.4.4.min.js
// ==/UserScript==
//
GM_addStyle('svg {border: 1px solid #999; overflow: hidden; background-color:#fff;}');
GM_addStyle('.node {  white-space: nowrap; text-align: center}');
GM_addStyle('.node.open rect,.node.open circle,.node.open ellipse, .node.open diamond {stroke: #333;fill: #78CFFF; stroke-width: 1.5px;}');
GM_addStyle('.node.blocked rect,.node.blocked circle,.node.blocked ellipse , .node.blocked diamond {stroke: #333;fill: #F62500; stroke-width: 1.5px;}');
GM_addStyle('.node.inprogress rect,.node.inprogress circle,.node.inprogress ellipse, .node.inprogress diamond  {stroke: #333;fill: #FFB300; stroke-width: 1.5px;}');
GM_addStyle('.node.resolved rect,.node.resolved circle,.node.resolved ellipse, .node.resolved diamond  {stroke: #333;fill: #7ED321; stroke-width: 1.5px;}');
GM_addStyle('.node.qa rect,.node.qa circle,.node.qa ellipse, .node.qa diamond  {stroke: #333;fill: #B8E986; stroke-width: 1.5px;}');
GM_addStyle('.node.qablocked rect,.node.qablocked circle,.node.qablocked ellipse, .node.qablocked diamond  {stroke: #333;fill: #FC927C; stroke-width: 1.5px;}');
GM_addStyle('.node.closed rect,.node.closed circle,.node.closed ellipse, .node.closed diamond  {stroke: #333;fill: #A6A6A6; stroke-width: 1.5px;}');
GM_addStyle('.node.pending rect,.node.pending circle,.node.pending ellipse, .node.pending diamond  {stroke: #333;fill: #fff; stroke-width: 1.5px;}');

GM_addStyle('.cluster rect {  stroke: #333;  fill: #000;  fill-opacity: 0.1;  stroke-width: 1.5px;}');
GM_addStyle('.edgePath path.path {  stroke: #333;  stroke-width: 1.5px;  fill: none;}');
 
jQuery.getScript('http://d3js.org/d3.v3.js');
jQuery.getScript('http://cpettitt.github.io/project/dagre-d3/latest/dagre-d3.js');
jQuery.getScript('http://cpettitt.github.io/project/graphlib-dot/v0.5.2/graphlib-dot.js');
(function() {

  var JiraSearch = function (url){
    // This factory will create the actual method used to fetch issues from JIRA. This is really just a closure that saves us having
    // to pass a bunch of parameters all over the place all the time.

    var self = {};

    self.url = url + '/rest/api/latest';
    self.fields = ['summary', 'key', 'issuetype', 'issuelinks', 'status', 'assignee', 'customfield_10002'].join(",");
    self.get = function (uri, params) {
      params = !!params ? params : {};
      return jQuery.getJSON(self.url + uri, params);
    };

    self.get_issue = function (key) {
      //Given an issue key (i.e. JRA-9) return the JSON representation of it. This is the only place where we deal
      //with JIRA's REST API.
      console.log('Fetching ' + key);
      // we need to expand subtasks and links since that's what we care about here.
      return self.get('/issue/' + key, {'fields': self.fields});
      // Get_issue returns the whole response (which is a json object)
      //  return data;
      //})
    };

    self.query = function (query){
        console.log('Querying ' + query);
        // TODO comment
        return self.get('/search', {'jql': query, 'fields': self.fields});

        // query returns content.issues
    };
    return self;
  },
  statusClassMap = {
    "1": 'open',
    "4": 'open', //This is actually reopened...
    "5": 'resolved',
    "6": 'closed',
    "3": 'inprogress',
    "10104": 'pending',
    "10107": 'qa',
    "10274": 'qablocked'

  },
  build_graph_data = function (start_issue_key, jira, excludes){
    // Given a starting image key and the issue-fetching function build up the GraphViz data representing relationships
    // between issues. This will consider both subtasks and issue links.

    var get_key = function (issue) {
      return issue.key;
    },

    process_link = function (issue_key, link, summary, shape, fields) {
        var direction, indicator, linked_issue, linked_issue_key, link_type, assigneeString,
        statusClass = (_.isUndefined(fields.status.id)) ? 'open' : statusClassMap[fields.status.id];

        assigneeString = (_.isNull(fields.assignee)) ? '' :
          '<br><img src=\''+ fields.assignee.avatarUrls["48x48"] + 
          '\' title=\'' + fields.assignee.displayName + 
          '\' width=\'16\' height=\'16\'>'; 

        if (_.has(link, 'outwardIssue')) {
          direction = 'outward';
          indicator = " => ";
        }
        else if (_.has(link, 'inwardIssue')){
          direction = 'inward';
          indicator = " <= ";
        }
        else {
          return null;
        }

        linked_issue = link[direction + 'Issue'];
        linked_issue_key = get_key(linked_issue);
        link_type = link.type[direction];

        if (_.include(excludes, link_type)){
            return [linked_issue_key, null];
            }

        console.log(issue_key + indicator + link_type + indicator + linked_issue_key);

          

        node = '"' + issue_key + '"' + "->" + '"' + linked_issue_key + '"';
        node = '"' + issue_key +
          '" [labelType="html" label="<img src=\''+ fields.status.iconUrl + 
          '\' title=\'' + fields.status.name + 
          '\' width=\'16\' height=\'16\' ><span><a href=\'/browse/' + issue_key + 
          '\'class=\'issue-link link-title\'>' + issue_key +
          '</a> ' + fields.customfield_10002 + '<br><span class=\'link-summary\'>' + summary + 
          '</span>' + assigneeString +           
          '</span>", shape="' + shape +
          '", class="' + statusClass + 
          '"];' + node;
        return [linked_issue_key, node];
    },
    split_string = function (string, length){
        var words = string.split(' '),
        final = [],
        lineLength = 0,
        newLine = [];

        _.each(words, function (word) {
            lineLength = lineLength + word.length + 1;
            newLine.push(word);
            if (lineLength > length) {
                final.push(newLine.join(' '));
                lineLength = 0;
                newLine = [];
            }
       });

        final.push(newLine.join(' '));
        return final.join("<br>");
    },
            
    // since the graph can be cyclic we need to prevent infinite recursion
    seen = {},

    walk = function (issue_key, graph){
        // issue is the JSON representation of the issue """
        var request = jira.get_issue(issue_key),
        jqDef = jQuery.Deferred();
        request.done(function (issue) {
          var children = [],
          fields = issue.fields,
          assignee = (_.isNull(fields.assignee))?{avatarUrls:{"48x48":''}, displayName: ''}:fields.assignee,
          summary = fields.summary,
          node,
          defChildren = [];

          // Check to see if we have seen this issue...
          if (!_.has(seen, issue_key)) {

            seen[issue_key] = '1';
            summary = summary.replace("\"","'");
            summary = split_string(summary, 25);
            if (fields.issuetype.name === 'Epic') {
                node = '"' + issue_key + '"' + ' [class="open", label="' + issue_key + '\\n' + summary + '"]';
                graph.push(node);
            }
            shape = fields.issuetype.name === 'Task' ? "rect" : 
                    fields.issuetype.name === 'Bug' ? "circle" :
                    fields.issuetype.name === 'Epic' ? "diamond" :
                    "ellipse";
            //if fields.has_key('subtasks'):
            //    for subtask in fields['subtasks']:
            //        subtask_key = get_key(subtask)
            //        log(issue_key + ' => has subtask => ' + subtask_key)
            //        node = '"%s"->"%s"[color=blue][label="subtask"]' % (issue_key, subtask_key)
            //        graph.push(node)
            //        children.push(subtask_key)
            if (_.has(fields, 'issuelinks')) {
                _.each(fields.issuelinks, function (other_link) {
                    result = process_link(issue_key, other_link, summary, shape, fields);
                    if (result !== null) {
                        children.push(result[0]);
                        if (result[1] !== null) {
                            graph.push(result[1]);
                        } 
                    }
                });  
            }
            // now construct graph data for all subtasks and links of this issue
            _.each(children, function (child) {
              var defChild = walk(child, graph);
              defChildren.push(defChild);
            });
          }
          // resolve the deferred when the children are done
          // if there are no children this resolves right away.
          jQuery.when.apply(window, defChildren).done(function () {
            jqDef.resolve(graph);
          });

        });
        return jqDef;
    };
    
    return  walk(start_issue_key, []);
  },
  print_graph = function (graph_data){
    var svg, inner, zoom,
    graphString = graph_data.join(';\n'),
    render = dagreD3.render(),
    location = jQuery('#graph_container');
    
    //location.empty().css("display", "block");
    location.append('<svg width=' + location.width() + ' height=' + location.height() + '><g></g></svg>');
    //Set up zoom on svg
    svg = d3.select("#graph_container svg");
    inner = d3.select("#graph_container svg g");


    zoom = d3.behavior.zoom().scaleExtent([0.1, 100]).on("zoom", function() {
      inner.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    });
    svg.call(zoom);


      graphString = 'digraph{' + graphString + '}';
      console.log(graphString);
     try {
        g = graphlibDot.read(graphString);
      } catch (e) {
        //inputGraph.setAttribute("class", "error");
        throw e;
      }

      // Save link to new graph
      //graphLink.attr("href", graphToURL());

      // Set margins, if not present
      if (!g.graph().hasOwnProperty("marginx") &&
          !g.graph().hasOwnProperty("marginy")) {
        g.graph().marginx = 20;
        g.graph().marginy = 20;
      }

      g.graph().transition = function(selection) {
        return selection.transition().duration(500);
      };

      // Render the graph into svg g
      d3.select("#graph_container svg g").call(render, g);   
  },
  main = function (){
    var options = {}, jira, graphPromise;
    options.jira_url = window.location.origin;
    options.excludes = ["requires", "is related to", "subtask", "duplicates"];
    options.issue = (window.location.pathname).split("/")[2];
    
    
    
    jira = JiraSearch(options.jira_url);
    graphPromise = build_graph_data(options.issue, jira, options.excludes);

    graphPromise.done(function (graph) {
      print_graph(graph);
    });
  };
  //Wire to work on right click of Links Hierarchy
  jQuery(function(){
    var container = jQuery('<div/>', {
      id:'graph_container',
        css:{
          position:'fixed',
          top: '20px',
          bottom: "20px",
          left: "20px",
          right: "20px",
          backgroundColor: "white",
          zIndex:1000,
          display: "none",
          padding:"20px",
          boxShadow: "1px 1px 4px #eee",
          border: "1px solid #ccc",
          backgroundImage: "url('../download/resources/com.docminer.jira.issue-links:lhs-resources/images/wait.gif')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundRttachment: "fixed"
        }
      }
    );
    jQuery('body').append(container);

    //Poorly wire up dismissing the pop up
    jQuery('body').keydown(function(e){
    if(e.which == 27){
      jQuery(container).hide();
    }
});
    jQuery('li[data-label="Links Hierarchy"], #linkingmodule_heading').on('contextmenu', function(e) {
      jQuery(container).empty().show();
      main();
      return false;
    });
  });
})();



