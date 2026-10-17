import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {palette} from '../theme/tokens';

type Props={items:string[];active:string;onSelect:(item:string)=>void};
/** Accessible horizontal navigation. Permission filtering remains in the parent. */
export function WorkspaceTabs({items,active,onSelect}:Props){
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container} contentContainerStyle={styles.tabs} accessibilityLabel="Workspace sections">
  {items.map(item=><TouchableOpacity key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{selected:item===active}} onPress={()=>onSelect(item)} style={[styles.tab,item===active&&styles.selected]}><Text style={[styles.text,item===active&&styles.selectedText]}>{item}</Text></TouchableOpacity>)}
 </ScrollView>;
}
const styles=StyleSheet.create({container:{flexGrow:0,marginBottom:10},tabs:{flexDirection:'row',gap:8,paddingBottom:6},tab:{minHeight:48,minWidth:84,paddingHorizontal:14,justifyContent:'center',alignItems:'center',borderRadius:14,backgroundColor:'#ebeafa'},selected:{backgroundColor:palette.primary},text:{fontSize:12,fontWeight:'700',color:palette.text},selectedText:{color:'#fff'}});
