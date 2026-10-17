import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {palette, radius} from '../theme/tokens';

type Props = {label: string; onPress: () => void; disabled?: boolean; busy?: boolean};
/** Accessible shared action control. Disabled actions cannot be triggered twice. */
export function ActionButton({label,onPress,disabled=false,busy=false}:Props){
 const inactive=disabled||busy;
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
   accessibilityState={{disabled:inactive,busy}} disabled={inactive} onPress={onPress}
   style={[styles.button,inactive&&styles.disabled]}>
   {busy?<ActivityIndicator color={palette.surface}/>:<Text style={styles.text}>{label}</Text>}
 </TouchableOpacity>;
}
const styles=StyleSheet.create({
 button:{backgroundColor:palette.primary,borderRadius:radius.md,padding:14,alignItems:'center',justifyContent:'center',minHeight:48,marginVertical:10},
 disabled:{opacity:.45},text:{color:palette.surface,fontWeight:'800'},
});
