var services = angular.module('todoServices', []);
var controllers = angular.module('todoControllers', []);

var FIREBASE_URI = 'https://popping-fire-791.firebaseio.com';

services.service('TodoService', ['$rootScope', '$firebase', function( $rootScope, $firebase ){

	var FB = new Firebase( FIREBASE_URI );
	var userRef = null;
	var todos = null;
	var parents = null;
	var scope = null;
	var allItems = null;

	function setup( ref, _scope ){
		userRef = ref;
		scope = _scope;
		todos = userRef.child('todos');
		todos.child('items').once('value', function( snapshot ){
			allItems = snapshot.val();
		});
	}

	function addItem( parentId, e){
		var val = angular.element(e.target).val()
		if(e.keyCode == 13){
			console.log(val, parentId);
			var item = {
				description: val,
				parent: parentId,
				isDone: false,
				weight: 0
			}
			if( parentId == 0){
				$firebase(todos).$child('parents').$add( item );
			}
			else{
				todos.child('parents/' + parentId).once('value', function( snapshot ){
					//If snapshot.val then the parent is a top level item, otherwise add it to the 'items' 
					var target = 'items';
					if( snapshot.val() ){
						target = 'parents';
					}
					$firebase(todos).$child('items').$add(item).then( function( v ){
						$firebase(todos).$child( target + '/' + parentId ).$child('children').$add( v.name() );
					} );
				});
			}
		}
	}

	function checkItem( id, state ){
		$firebase(todos).$child('items/' + id).$update({ isDone: !state });
	}
	function deleteFromParent( itemId, parentId ){
		todos.child( 'parents/' + parentId ).once('value', function( snapshot ){
			if( snapshot.val() ){
				//Parent is top level
				var parentRef = snapshot.ref().child('children');
			}
			else{
				var parentRef = todos.child('items/' + parentId + '/children');
			}
			parentRef.once('value', function( subSnap ){
				subSnap.forEach( function( childIds ){
					if( childIds.val() == itemId ){
						console.log( 'match!', childIds.val(), itemId );
						childIds.ref().remove();
					}
				} )
			})
		});
	}
	function deleteItem( item ){
		$firebase(todos).$child('items').$remove( item.id );

		deleteFromParent( item.id, item.parent );

		if( item.nodes ){
			for(var i = 0; i < item.nodes.length; i++){
				deleteItem( item.nodes[i] );
			}
		}
	}

	function getChildIds( data ){
		var list = [];
		angular.forEach( data, function( val ){
			list.push( val );
		});
		return list;
	}

	var currentParent = null;
	var currentTopLevelIds = [];

	function getListForParent( parentId, callback ){
		if( parentId != currentParent ){
			currentParent = parentId;
		}
		todos.child('parents/' + parentId + '/children').on('value', function( snapshot ){
			var data = snapshot.val();
			currentTopLevelIds = [];
			if( data ){
				angular.forEach( data, function( val, index ){
					currentTopLevelIds.push( val );
				} );
				var list = _traverse( currentTopLevelIds );
				callback( list );
			}

		});
	}

	function _traverse( list ){
		var ret = [];

		angular.forEach( list, function( val, index ){
			var item = allItems[val];
			var ch = null;
			if( item.hasOwnProperty('children') ){
				var childIds = getChildIds( item.children );
				ch = _traverse( childIds );
			}

			ret.push( { data: item, parent: item.parent, nodes: ch, id: val } );
		} );
		return ret;
	}


	function getList( snapshot, callback ){
		allItems = snapshot.val();
		var list = _traverse( currentTopLevelIds );
		callback( list );
	}

	return {
		setup: setup,
		getListForParent: getListForParent,
		addItem: addItem,
		getList: getList,
		checkItem: checkItem,
		deleteItem: deleteItem
	}

} ] );

controllers.controller('mainCtrl', ['$scope', '$http', 'TodoService', '$firebase', function($scope, $http, TodoService, $firebase){
	var FB = new Firebase( FIREBASE_URI );
	var ngFB = $firebase( FB );
	var ctrl = this;

	ctrl.addItem = TodoService.addItem;
	ctrl.checkItem = TodoService.checkItem;
	ctrl.deleteItem = TodoService.deleteItem;

	ctrl.user = null;
	ctrl.currentParent = null;


	var auth = new FirebaseSimpleLogin(FB, function( error, user ){
		if(user != null){
			var ref = new Firebase( FIREBASE_URI + '/users/' + user.uid );
			var u = {
				ref : ref,
				ngRef : $firebase( ref ),
				parentsRef : $firebase( ref.child('/todos/parents') )
			}

			TodoService.setup( ref );

			ref.once('value', function( snapshot ){
				if( snapshot.val() === null ){
					$firebase( ref ).$update( { email: user.email } );
				}

				$scope.$apply(function(){
					ctrl.user = user;
					ctrl.user.refs = u;
				});
			});

			//Kanske ska ha on('child_added?')
			ref.child('todos/items').on('value', function( snapshot ){
				if( ctrl.currentParent ){
					ctrl.allNodes = [];
					TodoService.getList(snapshot, function( list ){
						console.log( 'all nodes', list );
						ctrl.allNodes = list;
					});
				}
				// console.log( snapshot.val() );
			})
		}
	});

	// ctrl.list = ngFB.$child('/todos');

	ctrl.login = function(){
		auth.login('password',{
			email: ctrl.username,
			password: ctrl.password
		});
	}
	ctrl.logout = function(){
		auth.logout();
		window.location.reload();
	}

	ctrl.getListForParent = function( parentId ){
		ctrl.currentParent = parentId;
		ctrl.allNodes = [];
		TodoService.getListForParent( parentId, function( list ){
			ctrl.allNodes = list;
			console.log( list );
		} );
	}


	ctrl.hide = function( e ){
		var item = $(e.target).closest( 'li' ).find('ul');
		$( item[0] ).toggleClass('collapsed');
	}

	ctrl.doAdd = function( e ){
		var item = $(e.target).closest( 'li' );
		var input = $(item.find('input')[0]);
		$('li').removeClass('add-new');

		if(!item.hasClass('add-new')){
			item.addClass('add-new');
		}
		input.focus();
	}

	// ctrl.deleteItem = function( item ){
	// 	ctrl.list.$remove( item.id );

	// 	if( item.nodes ){
	// 		for(var i = 0; i < item.nodes.length; i++){
	// 			ctrl.deleteItem( item.nodes[i] );
	// 		}
	// 	}
	// }


}]);

var app = angular.module('todoApp', ['firebase', 'todoServices', 'todoControllers']);


