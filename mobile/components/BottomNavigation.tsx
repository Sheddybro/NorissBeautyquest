import React from 'react';
import {StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {palette} from '../theme/tokens';
const symbols:Record<string,string>={Home:'⌂',Inventory:'▦',Checkout:'⊕',Receipts:'▤'};
type Props={items:string[];active:string;onSelect:(item:string)=>void};
/** Primary mobile navigation; permission-filtered by the parent. */
export function BottomNavigation({items,active,onSelect}:Props){
 return <View style={styles.bar} accessibilityLabel="Primary navigation">{items.map(item=><TouchableOpacity key={item} onPress={()=>onSelect(item)} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{selected:item===active}} style={[styles.item,item===active&&styles.active]}><Text style={[styles.symbol,item===active&&styles.selected]}>{symbols[item]||'•'}</Text><Text style={[styles.label,item===active&&styles.selected]}>{item}</Text></TouchableOpacity>)}</View>;
}
const styles=StyleSheet.create({bar:{flexDirection:'row',justifyContent:'space-around',backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#e6eaf3',paddingTop:10,paddingBottom:9,marginHorizontal:-16,paddingHorizontal:10,elevation:8},item:{minHeight:53,flex:1,alignItems:'center',justifyContent:'center',borderRadius:15},active:{backgroundColor:'#efedff'},symbol:{fontSize:24,color:'#8490ab',fontWeight:'800'},label:{fontSize:10,fontWeight:'700',color:'#78849c',marginTop:2},selected:{color:palette.primaryDark}});
