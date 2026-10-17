import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {palette} from '../theme/tokens';
export function MetricCard({icon,label,value}:{icon:string;label:string;value:number|string}){
 return <View style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}><Text style={styles.icon}>{icon}</Text><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
const styles=StyleSheet.create({card:{flex:1,backgroundColor:palette.surface,borderRadius:20,padding:18,borderWidth:1,borderColor:palette.border,elevation:2,minHeight:132},icon:{fontSize:21,color:palette.primary,marginBottom:9},label:{fontSize:12,color:palette.muted},value:{fontSize:30,fontWeight:'900',color:palette.text,marginTop:6}});
