import { StyleSheet, Text, View } from 'react-native'
import React from 'react'

export default function Saved() {
  return (
    <View style={styles.container}>
      <Text>SavedScreen</Text>
    </View>
  )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    }
})